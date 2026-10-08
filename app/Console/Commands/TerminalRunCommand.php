<?php

namespace App\Console\Commands;

use App\Services\Docker;
use App\Services\ShellEnvironment;
use App\Services\TerminalSessions;
use Illuminate\Console\Command;
use Illuminate\Http\Client\ConnectionException;

/**
 * Background process behind a dashboard terminal session.
 *
 * Opens an interactive shell with a TTY — through `docker exec` for a container, or a
 * local pty in a project's folder — and pipes it to the session files: shell output is
 * appended to output.log and keystrokes are read from input.log.
 * Started by TerminalSessions::start(), it runs until the shell exits or the session is
 * stopped from the dashboard.
 *
 * Doesn't use the pcntl and posix extensions: the PHP binary bundled with the desktop
 * app has neither.
 */
class TerminalRunCommand extends Command
{
    /**
     * File inside the container holding the shell's pid, used to end it with the session.
     */
    private const SHELL_PID_FILE = '/tmp/.dashboard-terminal.pid';

    /**
     * Signal numbers (the SIG* constants come with the pcntl extension).
     */
    private const SIGNALS = ['HUP' => 1, 'KILL' => 9];

    /**
     * Runs in the pty before the local shell (args: tty file, rows, cols, shell): records
     * the tty name (to resize it later), applies the size and becomes the login shell.
     */
    private const LOCAL_SHELL_WRAPPER = 'tty > "$1"; stty rows "$2" cols "$3"; exec "$4" -l';

    protected $signature = 'terminal:run {session}';

    protected $description = 'Run the interactive shell session of a dashboard terminal';

    protected $hidden = true;

    private bool $running = true;

    public function handle(Docker $docker, TerminalSessions $sessions, ShellEnvironment $environment): int
    {
        $key = $this->argument('session');
        $session = $sessions->session($key);

        // Held until this process ends: the session runs while it's locked.
        $lock = $sessions->claim($key);

        // "e": the shell must not inherit it (its output goes through the pty).
        $output = fopen($sessions->path($key, 'output.log'), 'abe');

        if ($lock === null || $output === false || $session === null) {
            return self::FAILURE;
        }

        try {
            $shell = $session['target']['type'] === 'local'
                ? $this->openLocal($sessions, $environment, $key, $session['target']['cwd'], $session['cols'], $session['rows'])
                : $this->openContainer($docker, $sessions, $key, $session['target']['container']);
        } catch (\RuntimeException $e) {
            fwrite($output, "\r\n\e[31m{$e->getMessage()}\e[0m\r\n");
            fclose($output);

            return self::FAILURE;
        }

        $this->pipe($shell['read'], $shell['write'], $shell['alive'], $output, $sessions->path($key, 'input.log'), fn () => $sessions->stopRequested($key));

        // Stopped from the dashboard: hang up the shell like closing a real terminal,
        // so it forwards SIGHUP to its jobs (e.g. `php artisan serve`) and exits.
        if (! $this->running) {
            ($shell['hangUp'])();
        }

        ($shell['close'])();

        fwrite($output, "\r\n\e[2m[Session ended]\e[0m\r\n");
        fclose($output);

        return self::SUCCESS;
    }

    /**
     * Shell inside a container, through an interactive `docker exec`.
     *
     * @return array{read: resource, write: resource, alive: \Closure(): bool, hangUp: \Closure(): void, close: \Closure(): void}
     */
    private function openContainer(Docker $docker, TerminalSessions $sessions, string $key, string $container): array
    {
        $execId = $this->createExec($docker, $container);
        $socket = $this->attach($docker, $execId);

        $sessions->setRuntime($key, ['exec_id' => $execId]);

        $session = $sessions->session($key);
        $sessions->resize($key, $session['cols'] ?? 80, $session['rows'] ?? 24);

        return [
            'read' => $socket,
            'write' => $socket,
            'alive' => fn () => true, // The socket closes when the shell exits.
            // Docker keeps an exec running after its client leaves, so end the shell explicitly.
            'hangUp' => fn () => $this->hangUpContainerShell($docker, $container),
            'close' => function () use ($socket) {
                fclose($socket);
            },
        ];
    }

    /**
     * Login shell on this machine, in the project's folder.
     *
     * PHP's own pty doesn't become the shell's controlling terminal, which breaks Ctrl+C
     * and job control. script(1) gives the shell a pty that is: it runs it as the leader
     * of a new session on the pty, and copies data between the pty and our pipes.
     *
     * @return array{read: resource, write: resource, alive: \Closure(): bool, hangUp: \Closure(): void, close: \Closure(): void}
     */
    private function openLocal(TerminalSessions $sessions, ShellEnvironment $environment, string $key, string $cwd, int $cols, int $rows): array
    {
        $home = getenv('HOME') ?: '/';
        $ttyFile = $sessions->path($key, 'tty');

        $process = proc_open(
            ['/usr/bin/script', '-q', '/dev/null', '/bin/sh', '-c', self::LOCAL_SHELL_WRAPPER, 'sh', $ttyFile, (string) $rows, (string) $cols, getenv('SHELL') ?: '/bin/zsh'],
            [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']],
            $pipes,
            is_dir($cwd) ? $cwd : $home,
            // Only the user's variables: this app's .env values would override the project's own.
            [...$environment->variables(), 'TERM' => 'xterm-256color', 'COLORTERM' => 'truecolor'],
        );

        if ($process === false) {
            throw new \RuntimeException('Could not start a local shell.');
        }

        $pid = proc_get_status($process)['pid'];
        $tty = $this->waitForFile($ttyFile);

        $sessions->setRuntime($key, array_filter(['tty' => $tty, 'script_pid' => $pid]));
        @unlink($ttyFile);

        stream_set_blocking($pipes[1], false);

        return [
            'read' => $pipes[1],
            'write' => $pipes[0],
            'alive' => fn () => proc_get_status($process)['running'],
            'hangUp' => fn () => $this->hangUpLocalShell($process, $tty),
            'close' => function () use ($process, $pipes) {
                foreach ($pipes as $pipe) {
                    fclose($pipe);
                }

                proc_close($process);
            },
        ];
    }

    /**
     * Hang up everything attached to the session's terminal, background jobs included
     * (zsh doesn't forward SIGHUP to them), then force whatever is left.
     *
     * @param  resource  $process
     */
    private function hangUpLocalShell($process, ?string $tty): void
    {
        $signal = function (string $name) use ($process, $tty) {
            if ($tty !== null) {
                exec('/usr/bin/pkill -'.$name.' -t '.escapeshellarg(basename($tty)));
            }

            // script(1) itself: it exits along with the shell anyway.
            proc_terminate($process, self::SIGNALS[$name]);
        };

        $signal('HUP');

        // Give them a moment to exit.
        for ($i = 0; $i < 20 && proc_get_status($process)['running']; $i++) {
            usleep(100_000);
        }

        $signal('KILL');
    }

    private function waitForFile(string $path): ?string
    {
        for ($i = 0; $i < 50; $i++) {
            $contents = @file_get_contents($path);

            if (is_string($contents) && str_ends_with($contents, "\n")) {
                return trim($contents);
            }

            usleep(20_000);
        }

        return null;
    }

    private function createExec(Docker $docker, string $container): string
    {
        try {
            $response = $docker->http()->timeout(5)->post("http://localhost/containers/{$container}/exec", [
                'AttachStdin' => true,
                'AttachStdout' => true,
                'AttachStderr' => true,
                'Tty' => true,
                'Env' => ['TERM=xterm-256color'],
                // Record the shell pid, then prefer bash when the image has it.
                'Cmd' => ['/bin/sh', '-c', 'echo $$ > '.self::SHELL_PID_FILE.'; if command -v bash >/dev/null 2>&1; then exec bash -l; else exec sh -l; fi'],
            ]);
        } catch (ConnectionException) {
            throw new \RuntimeException('Could not connect to Docker.');
        }

        if ($response->failed()) {
            throw new \RuntimeException($response->json('message') ?? 'Could not start a shell in the container.');
        }

        return $response->json('Id');
    }

    private function hangUpContainerShell(Docker $docker, string $container): void
    {
        try {
            $exec = $docker->http()->timeout(3)->post("http://localhost/containers/{$container}/exec", [
                'Cmd' => ['/bin/sh', '-c', 'kill -HUP "$(cat '.self::SHELL_PID_FILE.')"; rm -f '.self::SHELL_PID_FILE],
            ]);

            $docker->http()->timeout(3)->post("http://localhost/exec/{$exec->json('Id')}/start", ['Detach' => true]);
        } catch (ConnectionException) {
            // Docker is gone, and the shell with it.
        }
    }

    /**
     * Start the exec and hijack the connection into a raw bidirectional TTY stream.
     *
     * @return resource
     */
    private function attach(Docker $docker, string $execId)
    {
        $socket = @stream_socket_client('unix://'.$docker->socket(), $errno, $error, 5);

        if ($socket === false) {
            throw new \RuntimeException("Could not connect to Docker: {$error}");
        }

        $body = json_encode(['Detach' => false, 'Tty' => true], JSON_THROW_ON_ERROR);

        fwrite($socket, implode("\r\n", [
            "POST /exec/{$execId}/start HTTP/1.1",
            'Host: localhost',
            'Content-Type: application/json',
            'Connection: Upgrade',
            'Upgrade: tcp',
            'Content-Length: '.strlen($body),
            '',
            $body,
        ]));

        // Read the response headers byte by byte so no shell output is consumed with them.
        $headers = '';

        while (! str_ends_with($headers, "\r\n\r\n")) {
            $byte = fread($socket, 1);

            if ($byte === false || $byte === '') {
                throw new \RuntimeException('Docker closed the connection while starting the shell.');
            }

            $headers .= $byte;
        }

        if (! preg_match('#^HTTP/1\.[01] (101|200)#', $headers)) {
            throw new \RuntimeException('Could not start the shell: '.strtok($headers, "\r\n"));
        }

        stream_set_blocking($socket, false);

        return $socket;
    }

    /**
     * Copy shell output to the output file and input file contents to the shell.
     *
     * @param  resource  $read
     * @param  resource  $write
     * @param  \Closure(): bool  $alive
     * @param  resource  $output
     * @param  \Closure(): bool  $stopRequested
     */
    private function pipe($read, $write, \Closure $alive, $output, string $inputPath, \Closure $stopRequested): void
    {
        $inputOffset = 0;

        while ($this->running) {
            if ($stopRequested()) {
                $this->running = false;

                return;
            }

            $readable = [$read];
            $none = null;
            $except = null;

            // Wake up at least every 30ms to forward keystrokes.
            if (@stream_select($readable, $none, $except, 0, 30_000) > 0) {
                $data = @fread($read, 65536);

                if ($data === false || ($data === '' && feof($read))) {
                    return; // The shell exited.
                }

                fwrite($output, $data);
                fflush($output);
            } elseif (! $alive()) {
                return; // The shell exited and all its output was read.
            }

            clearstatcache(true, $inputPath);
            $size = @filesize($inputPath) ?: 0;

            $pending = $size - $inputOffset;

            if ($pending > 0) {
                $input = file_get_contents($inputPath, false, null, $inputOffset, $pending);

                if ($input !== false) {
                    $inputOffset += strlen($input);
                    $this->write($write, $input);
                }
            }
        }
    }

    /**
     * @param  resource  $stream
     */
    private function write($stream, string $data): void
    {
        while ($data !== '' && $this->running) {
            $written = fwrite($stream, $data);

            if ($written === false) {
                return;
            }

            $data = substr($data, $written);

            if ($data !== '') {
                usleep(1000);
            }
        }
    }
}
