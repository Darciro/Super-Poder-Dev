<?php

namespace App\Services;

use Illuminate\Support\Facades\Process;

/**
 * Apps served straight from a terminal on this machine, outside Docker:
 * PHP's built-in server (`php -S`, also behind `php artisan serve`).
 */
class LocalServers
{
    /**
     * @return array<int, array{pid: int, address: string, url: string, path: string|null, name: string|null}>
     */
    public function running(): array
    {
        $result = Process::timeout(3)->run(['ps', '-axo', 'pid=,command=']);

        if ($result->failed()) {
            return [];
        }

        return collect(explode("\n", $result->output()))
            ->map(fn (string $line) => $this->parse($line))
            ->filter()
            ->sortBy(fn (array $server) => (int) substr(strrchr($server['address'], ':') ?: '', 1))
            ->values()
            ->all();
    }

    /**
     * @return array{pid: int, address: string, url: string, path: string|null, name: string|null}|null
     */
    private function parse(string $line): ?array
    {
        if (! preg_match('#^\s*(\d+)\s+(?:\S*/)?php[\d.]*\s+(?:.*\s)?-S\s*(\S+)(.*)$#', $line, $matches)) {
            return null;
        }

        [, $pid, $address, $rest] = $matches;

        [$host, $port] = array_pad(explode(':', $address, 2), 2, null);
        $host = in_array($host, ['0.0.0.0', '[::]', ''], true) ? 'localhost' : $host;
        $path = $this->projectPath((int) $pid, $rest);

        return [
            'pid' => (int) $pid,
            'address' => $address,
            'url' => "http://{$host}".($port ? ":{$port}" : ''),
            'path' => $path,
            'name' => $path ? basename($path) : null,
        ];
    }

    /**
     * Folder of the served app: the project behind `artisan serve` (its router lives
     * in the project's vendor folder), otherwise the directory the server runs in.
     */
    private function projectPath(int $pid, string $arguments): ?string
    {
        if (preg_match('#\s(/\S+?)/vendor/#', $arguments, $matches)) {
            return $matches[1];
        }

        $result = Process::timeout(3)->run(['lsof', '-a', '-p', (string) $pid, '-d', 'cwd', '-Fn']);

        if ($result->failed() || ! preg_match('/^n(.+)$/m', $result->output(), $matches)) {
            return null;
        }

        return $matches[1];
    }
}
