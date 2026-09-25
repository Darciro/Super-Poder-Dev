<?php

namespace App\Console\Commands;

use App\Services\Docker;
use App\Services\TerminalSessions;
use Illuminate\Console\Command;
use Illuminate\Http\Client\ConnectionException;

/**
 * Background process behind a dashboard terminal session.
 *
 * Opens an interactive shell with a TTY — through `docker exec` for a container, or a
 * local pty in a project's folder — and pipes it to the session files: shell output is
 * appended to output.log and keystrokes are read from input.log.
 * Started by TerminalSessions::start(), it runs until the shell exits or it receives SIGTERM.
 */
class TerminalRunCommand extends Command
{
    /**
     * File inside the container holding the shell's pid, used to end it with the session.
     */
    private const SHELL_PID_FILE = '/tmp/.dashboard-terminal.pid';

    /**
     * Environment variables a local shell inherits. Everything else is left out, in
     * particular this app's .env values, which would override the project's own .env.
     */
    private const LOCAL_ENV = ['HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'SSH_AUTH_SOCK'];

    /**
     * Runs in the pty before the local shell (args: tty file, rows, cols, shell).
     *
     * PHP's pty doesn't become the shell's controlling terminal, which breaks Ctrl+C and
     * job control. A new session leader opening its tty acquires it, so do that, record
     * the tty name (to resize it later), apply the size and become the user's login shell.
     */
    private const LOCAL_SHELL_WRAPPER = <<<'PHP'
        [, $ttyFile, $rows, $cols, $shell] = $argv;
        posix_setsid();
        $tty = posix_ttyname(STDIN);
        $controlling = fopen($tty, 'r+');
        file_put_contents($ttyFile, $tty."\n");
        exec('/bin/stty rows '.(int) $rows.' cols '.(int) $cols);
        pcntl_exec($shell, ['-l'], getenv());
        PHP;

    protected $signature = 'terminal:run {session}';

    protected $description = 'Run the interactive shell session of a dashboard terminal';

    protected $hidden = true;

    private bool $running = true;

    public function handle(Docker $docker, TerminalSessions $sessions): int
    {
        $key = $this->argument('session');
        $session = $sessions->session($key);

        $this->detach();

        $output = fopen($sessions->path($key, 'output.log'), 'ab');

        if ($output === false || $session === null) {
            return self::FAILURE;
        }

        try {
            $shell = $session['target']['type'] === 'local'
                ? $this->openLocal($sessions, $key, $session['target']['cwd'], $session['cols'], $session['rows'])
                : $this->openContainer($docker, $sessions, $key, $session['target']['container']);
        } catch (\RuntimeException $e) {
            fwrite($output, "\r\n\e[31m{$e->getMessage()}\e[0m\r\n");
            fclose($output);

            return self::FAILURE;
        }

        $this->pipe($shell['read'], $shell['write'], $shell['alive'], $output, $sessions->path($key, 'input.log'));

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
     * Keep running on its own: survive the dev server restarting (Ctrl+C on `composer dev`)
     * and end cleanly when the session is stopped from the dashboard.
     */
    private function detach(): void
    {
        posix_setsid();

        pcntl_async_signals(true);
        pcntl_signal(SIGINT, SIG_IGN);
        pcntl_signal(SIGHUP, SIG_IGN);
        pcntl_signal(SIGTERM, fn () => $this->running = false);
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
     * @return array{read: resource, write: resource, alive: \Closure(): bool, hangUp: \Closure(): void, close: \Closure(): void}
     */
    private function openLocal(TerminalSessions $sessions, string $key, string $cwd, int $cols, int $rows): array
    {
        $home = getenv('HOME') ?: '/';
        $ttyFile = $sessions->path($key, 'tty');

        $process = proc_open(
            [PHP_BINARY, '-r', self::LOCAL_SHELL_WRAPPER, '--', $ttyFile, (string) $rows, (string) $cols, getenv('SHELL') ?: '/bin/zsh'],
            [['pty'], ['pty'], ['pty']],
            $pipes,
            is_dir($cwd) ? $cwd : $home,
            $this->localEnvironment(),
        );

        if ($process === false) {
            throw new \RuntimeException('Could not start a local shell.');
        }

        $pid = proc_get_status($process)['pid'];
        $tty = $this->waitForFile($ttyFile);

        $sessions->setRuntime($key, array_filter(['tty' => $tty, 'shell_pid' => $pid]));
        @unlink($ttyFile);

        stream_set_blocking($pipes[1], false);

        return [
            'read' => $pipes[1],
            'write' => $pipes[0],
            'alive' => fn () => proc_get_status($process)['running'],
            'hangUp' => fn () => $this->hangUpLocalShell($process, $pid, $tty),
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
    private function hangUpLocalShell($process, int $pid, ?string $tty): void
    {
        $signal = function (string $name) use ($pid, $tty) {
            if ($tty !== null) {
                exec('/usr/bin/pkill -'.$name.' -t '.escapeshellarg(basename($tty)));
            }

            posix_kill($pid, constant('SIG'.$name));
        };

        $signal('HUP');

        // Give them a moment to exit.
        for ($i = 0; $i < 20 && proc_get_status($process)['running']; $i++) {
            usleep(100_000);
        }

        $signal('KILL');
    }

    /**
     * @return array<string, string>
     */
    private function localEnvironment(): array
    {
        return collect(self::LOCAL_ENV)
            ->mapWithKeys(fn (string $name) => [$name => getenv($name)])
            ->filter(fn (string|false $value) => is_string($value) && $value !== '')
            ->merge(['TERM' => 'xterm-256color', 'COLORTERM' => 'truecolor'])
            ->all();
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
     */
    private function pipe($read, $write, \Closure $alive, $output, string $inputPath): void
    {
        $inputOffset = 0;

        while ($this->running) {
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
