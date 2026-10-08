<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use Native\Desktop\Facades\ChildProcess;
use Symfony\Component\Process\PhpExecutableFinder;

/**
 * Persistent interactive shells, one per key: inside a container (`docker exec`)
 * or on this machine in a project's folder.
 *
 * Each session is a background `terminal:run` process that keeps the TTY open,
 * independent of any HTTP request. In the desktop app it's a child process of the app,
 * so quitting the app ends it. It exchanges data through files:
 *
 *  - output.log: everything the shell printed (replayed when the terminal reopens)
 *  - input.log:  keystrokes, appended by the browser and consumed by the process
 *  - session.json: id, target, pid and size of the session
 *  - runtime.json: details only known once the shell runs (Docker exec id, local tty)
 *  - running.lock: locked by the process while it runs (the lock goes away with it)
 *  - stop: created to ask the process to end the session
 *
 * No signals are involved, so it works without the pcntl and posix extensions
 * (the PHP binary bundled with the desktop app has neither).
 */
class TerminalSessions
{
    /**
     * Output replayed when a terminal (re)connects from scratch.
     */
    private const REPLAY_BYTES = 512 * 1024;

    /**
     * Maximum output returned by a single read.
     */
    private const CHUNK_BYTES = 256 * 1024;

    /**
     * How long start() waits for the background process to take over the session.
     */
    private const START_TIMEOUT_MS = 5000;

    public function __construct(private Docker $docker) {}

    /**
     * Start a session, unless one is already running for the key.
     *
     * @param  array{type: 'container', container: string}|array{type: 'local', cwd: string}  $target
     */
    public function start(string $key, array $target, int $cols, int $rows): void
    {
        File::ensureDirectoryExists($this->path($key));

        // Serializes concurrent starts (e.g. two tabs) so only one shell is spawned.
        $lock = fopen($this->path($key, 'session.lock'), 'c');

        if ($lock === false) {
            throw new \RuntimeException('Could not lock the terminal session.');
        }

        flock($lock, LOCK_EX);

        try {
            if ($this->isRunning($key)) {
                return;
            }

            foreach (['output.log', 'input.log', 'runtime.json', 'stop'] as $file) {
                File::delete($this->path($key, $file));
            }

            File::put($this->path($key, 'output.log'), '');
            File::put($this->path($key, 'input.log'), '');

            // Written before spawning: the background process reads its target from it.
            $session = [
                'id' => (string) Str::uuid(),
                'target' => $target,
                'pid' => 0,
                'cols' => $cols,
                'rows' => $rows,
                'started_at' => now()->toIso8601String(),
            ];

            $this->writeSession($key, $session);

            if (config('nativephp-internal.running')) {
                $this->spawnInDesktopApp($key);
            } else {
                $this->writeSession($key, [...$session, 'pid' => $this->spawnDetached($key)]);
            }

            // Return once the session runs, so the terminal doesn't see it as ended meanwhile.
            $this->waitUntilRunning($key);
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /**
     * Read the output produced since the given offset of the given session.
     *
     * @return array{session: string|null, data: string, offset: int, running: bool}
     */
    public function output(string $key, ?string $session, int $offset): array
    {
        $current = $this->session($key)['id'] ?? null;
        $path = $this->path($key, 'output.log');

        clearstatcache(true, $path);
        $size = file_exists($path) ? filesize($path) : 0;

        // A different (or new) session starts from the beginning of its output.
        if ($session !== $current || $offset > $size) {
            $offset = 0;
        }

        if ($offset === 0) {
            $offset = max(0, $size - self::REPLAY_BYTES);
        }

        $length = min($size - $offset, self::CHUNK_BYTES);
        $data = $length > 0 ? (string) file_get_contents($path, false, null, $offset, $length) : '';

        return [
            'session' => $current,
            'data' => $data,
            'offset' => $offset + strlen($data),
            'running' => $this->isRunning($key),
        ];
    }

    /**
     * Send keystrokes to the shell.
     */
    public function input(string $key, string $data): void
    {
        File::append($this->path($key, 'input.log'), $data, lock: true);
    }

    /**
     * Resize the TTY to the terminal size in the browser.
     */
    public function resize(string $key, int $cols, int $rows): void
    {
        $session = $this->session($key);

        if ($session === null) {
            return;
        }

        $this->writeSession($key, [...$session, 'cols' => $cols, 'rows' => $rows]);

        // Not running yet: the background process applies the stored size once it is.
        $runtime = $this->runtime($key);

        if (isset($runtime['exec_id'])) {
            try {
                $this->docker->http()->timeout(3)->post("http://localhost/exec/{$runtime['exec_id']}/resize?h={$rows}&w={$cols}");
            } catch (ConnectionException) {
                // The next resize will try again.
            }
        }

        if (isset($runtime['tty'])) {
            // Changing the size of the tty also sends SIGWINCH to the program in the foreground.
            Process::run(['/bin/stty', '-f', $runtime['tty'], 'rows', (string) $rows, 'cols', (string) $cols]);
        }
    }

    /**
     * End the session (hangs up the shell and everything started from it).
     */
    public function stop(string $key): void
    {
        if ($this->isRunning($key)) {
            File::put($this->path($key, 'stop'), '');
        }
    }

    public function stopRequested(string $key): bool
    {
        $path = $this->path($key, 'stop');

        clearstatcache(true, $path);

        return file_exists($path);
    }

    /**
     * Mark the session as running for as long as the returned handle stays open
     * (closed explicitly or when the process ends, however it ends).
     *
     * @return resource|null Null when another process already runs the session.
     */
    public function claim(string $key)
    {
        File::ensureDirectoryExists($this->path($key));

        // "e": close on exec, so the shells this process starts don't inherit the lock.
        $lock = fopen($this->path($key, 'running.lock'), 'ce');

        if ($lock === false || ! flock($lock, LOCK_EX | LOCK_NB)) {
            return null;
        }

        return $lock;
    }

    public function isRunning(string $key): bool
    {
        $path = $this->path($key, 'running.lock');

        if (! file_exists($path)) {
            return false;
        }

        $lock = fopen($path, 'r');

        if ($lock === false) {
            return false;
        }

        // Locked by the session's process while it runs.
        $running = ! flock($lock, LOCK_SH | LOCK_NB);

        if (! $running) {
            flock($lock, LOCK_UN);
        }

        fclose($lock);

        return $running;
    }

    /**
     * Keys of the running sessions.
     *
     * @return array<int, string>
     */
    public function active(): array
    {
        return collect(File::directories($this->path()))
            ->map(fn (string $directory) => basename($directory))
            ->filter(fn (string $key) => $this->isRunning($key))
            ->values()
            ->all();
    }

    /**
     * @return array{id: string, target: array<string, string>, pid: int, cols: int, rows: int, started_at: string}|null
     */
    public function session(string $key): ?array
    {
        $path = $this->path($key, 'session.json');

        return file_exists($path) ? json_decode(File::get($path), true) : null;
    }

    /**
     * @return array{exec_id?: string, tty?: string, shell_pid?: int}
     */
    public function runtime(string $key): array
    {
        $path = $this->path($key, 'runtime.json');

        return file_exists($path) ? json_decode(File::get($path), true) ?? [] : [];
    }

    /**
     * @param  array{exec_id?: string, tty?: string, shell_pid?: int}  $runtime
     */
    public function setRuntime(string $key, array $runtime): void
    {
        File::replace($this->path($key, 'runtime.json'), json_encode($runtime, JSON_THROW_ON_ERROR));
    }

    public function path(string $key = '', string $file = ''): string
    {
        $directory = storage_path('app/private/terminals');

        File::ensureDirectoryExists($directory);

        return collect([$directory, $key, $file])->filter()->implode('/');
    }

    /**
     * Run the session as a child process of the desktop app: when the app quits, it
     * ends the session along with everything started from the shell.
     */
    private function spawnInDesktopApp(string $key): void
    {
        ChildProcess::artisan(['terminal:run', $key], alias: "terminal-{$key}");
    }

    /**
     * Run the session on its own, so it survives the dev server restarting
     * (Ctrl+C on `composer dev`): `&` makes the shell ignore SIGINT, `nohup` SIGHUP.
     *
     * @return int The pid of the process.
     */
    private function spawnDetached(string $key): int
    {
        // Close every inherited descriptor (e.g. the HTTP connection of this request),
        // otherwise the request would only finish when the session ends.
        $closeInherited = collect(range(3, 255))->map(fn (int $fd) => "{$fd}>&-")->implode(' ');

        $command = sprintf(
            'nohup %s artisan terminal:run %s < /dev/null > /dev/null 2>&1 %s & echo $!',
            escapeshellarg((new PhpExecutableFinder)->find(false) ?: 'php'),
            escapeshellarg($key),
            $closeInherited,
        );

        // Under `php artisan serve` child processes get an almost empty environment
        // (no HOME, so no Docker socket): hand over the real one.
        return (int) trim(Process::path(base_path())->env(getenv())->run($command)->output());
    }

    private function waitUntilRunning(string $key): void
    {
        for ($waited = 0; $waited < self::START_TIMEOUT_MS && ! $this->isRunning($key); $waited += 20) {
            usleep(20_000);
        }
    }

    /**
     * @param  array<string, mixed>  $session
     */
    private function writeSession(string $key, array $session): void
    {
        // Written atomically (temp file + rename) so readers never see a partial file.
        File::replace($this->path($key, 'session.json'), json_encode($session, JSON_THROW_ON_ERROR));
    }
}
