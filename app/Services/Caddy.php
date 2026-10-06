<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;

/**
 * The local Caddy reverse proxy: sites from its Caddyfile, status and start/stop.
 */
class Caddy
{
    public function __construct(private IntegrationSettings $settings) {}

    public function config(): string
    {
        return $this->settings->get('caddy_config');
    }

    /**
     * @return array{running: bool, config: string, exists: bool, sites: array<int, array{address: string, host: string, port: int, upstreams: array<int, string>}>}
     */
    public function status(): array
    {
        $exists = File::exists($this->config());

        return [
            'running' => $this->running(),
            'config' => $this->config(),
            'exists' => $exists,
            'sites' => $exists ? $this->sites(File::get($this->config())) : [],
        ];
    }

    /**
     * Caddy answers on its admin API while it runs.
     */
    public function running(): bool
    {
        try {
            return Http::timeout(2)->get($this->adminUrl('/config/'))->successful();
        } catch (ConnectionException) {
            return false;
        }
    }

    /**
     * Start Caddy in the background as root (ports 80/443 need it), like `sudo caddy run --config …`.
     * Tries passwordless sudo first, then asks for the password with the macOS admin prompt.
     */
    public function start(): bool
    {
        $log = storage_path('logs/caddy.log');

        // Created by us, so it stays writable after root appends to it.
        File::append($log, '');

        // `caddy start` runs `caddy run` in the background and waits until it's up.
        // HOME keeps Caddy's data (the trusted local CA) in the user's folder, as sudo does.
        $command = sprintf(
            'HOME=%s %s start --config %s >> %s 2>&1',
            escapeshellarg((string) getenv('HOME')),
            escapeshellarg($this->settings->get('caddy_binary')),
            escapeshellarg($this->config()),
            escapeshellarg($log),
        );

        if (Process::timeout(30)->run(['sudo', '-n', 'sh', '-c', $command])->successful()) {
            return true;
        }

        $script = sprintf('do shell script "%s" with administrator privileges', addcslashes($command, '"\\'));

        return Process::timeout(120)->run(['osascript', '-e', $script])->successful();
    }

    /**
     * Stop Caddy through its admin API (no root needed).
     */
    public function stop(): bool
    {
        try {
            return Http::timeout(10)->post($this->adminUrl('/stop'))->successful();
        } catch (ConnectionException) {
            return false;
        }
    }

    /**
     * Site blocks of a Caddyfile with the upstreams they proxy to.
     *
     * @return array<int, array{address: string, host: string, port: int, upstreams: array<int, string>}>
     */
    public function sites(string $caddyfile): array
    {
        $sites = [];
        $current = [];
        $depth = 0;

        foreach (preg_split('/\R/', $caddyfile) ?: [] as $line) {
            $line = trim(preg_replace('/(^|\s)#.*$/', '', $line));

            if ($line === '') {
                continue;
            }

            if ($depth === 0 && str_ends_with($line, '{')) {
                $label = trim(substr($line, 0, -1));

                // Skip the global options block and snippets.
                $current = $label === '' || str_starts_with($label, '(') ? [] : $this->addresses($label);

                foreach ($current as $address) {
                    $sites[$address] ??= [];
                }
            } elseif ($depth > 0 && preg_match('/^reverse_proxy\s+(.+?)\s*\{?$/', $line, $matches)) {
                foreach ($current as $address) {
                    array_push($sites[$address], ...preg_split('/\s+/', $matches[1]) ?: []);
                }
            }

            $depth += substr_count($line, '{') - substr_count($line, '}');
            $depth = max($depth, 0);
        }

        return collect($sites)
            ->map(function (array $upstreams, string $address) {
                [$host, $port] = $this->hostAndPort($address);

                return [
                    'address' => $address,
                    'host' => $host,
                    'port' => $port,
                    'upstreams' => array_values(array_unique($upstreams)),
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @return array<int, string>
     */
    private function addresses(string $label): array
    {
        return array_values(array_filter(preg_split('/[\s,]+/', $label) ?: []));
    }

    /**
     * @return array{0: string, 1: int}
     */
    private function hostAndPort(string $address): array
    {
        $scheme = str_starts_with($address, 'http://') ? 'http' : 'https';
        $address = preg_replace('#^https?://#', '', $address);
        $address = explode('/', $address, 2)[0];

        if (preg_match('/^(.*):(\d+)$/', $address, $matches)) {
            return [$matches[1] ?: 'localhost', (int) $matches[2]];
        }

        return [$address, $scheme === 'http' ? 80 : 443];
    }

    private function adminUrl(string $path): string
    {
        return rtrim($this->settings->get('caddy_admin'), '/').$path;
    }
}
