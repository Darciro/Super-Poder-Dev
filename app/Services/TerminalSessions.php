<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use Symfony\Component\Process\PhpExecutableFinder;

/**
 * Persistent interactive shells, one per key: inside a container (`docker exec`)
 * or on this machine in a project's folder.
 *
 * Each session is a background `terminal:run` process that keeps the TTY open,
 * independent of any HTTP request. It exchanges data through files:
 *
 *  - output.log: everything the shell printed (replayed when the terminal reopens)
 *  - input.log:  keystrokes, appended by the browser and consumed by the process
 *  - session.json: id, target, pid and size of the session
 *  - runtime.json: details only known once the shell runs (Docker exec id, local tty)
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

            foreach (['output.log', 'input.log', 'runtime.json'] as $file) {
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
            $pid = (int) trim(Process::path(base_path())->env(getenv())->run($command)->output());

            $this->writeSession($key, [...$session, 'pid' => $pid]);
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
     * End the session (kills the shell and everything started from it).
     */
    public function stop(string $key): void
    {
        $pid = $this->session($key)['pid'] ?? null;

        if ($pid && $this->isRunning($key)) {
            posix_kill($pid, SIGTERM);
        }
    }

    public function isRunning(string $key): bool
    {
        $pid = $this->session($key)['pid'] ?? null;

        // Signal 0 only checks that the process exists.
        return $pid > 0 && posix_kill($pid, 0);
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
     * @param  array<string, mixed>  $session
     */
    private function writeSession(string $key, array $session): void
    {
        // Written atomically (temp file + rename) so readers never see a partial file.
        File::replace($this->path($key, 'session.json'), json_encode($session, JSON_THROW_ON_ERROR));
    }
}
