<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Native\StatusMenu;
use App\Services\Caddy;
use App\Services\Docker;
use App\Services\LocalServers;
use App\Services\TerminalSessions;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response as ClientResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Http;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    /**
     * Ports of services that don't speak HTTP (databases, caches, SMTP, etc.).
     */
    private const NON_HTTP_PORTS = [21, 22, 25, 587, 1025, 1433, 3306, 5432, 5672, 6379, 9000, 11211, 27017];

    public function __construct(private Docker $docker) {}

    public function index(TerminalSessions $terminals, LocalServers $servers, Caddy $caddy): Response
    {
        return Inertia::render('dashboard', [
            'containers' => $this->containers(),
            'host' => $this->host(),
            'terminals' => $terminals->active(),
            'localServers' => $servers->running(),
            'caddy' => $caddy->status(),
            // Stats take ~1s per container (Docker samples CPU twice), so load them after the page.
            'stats' => Inertia::defer(fn () => $this->stats()),
        ]);
    }

    /**
     * Start, stop or restart a container.
     */
    public function containerAction(string $container, string $action): RedirectResponse
    {
        try {
            // Docker may take a while to stop a container (10s default grace period).
            $response = $this->docker->http()
                ->timeout(30)
                ->post("http://localhost/containers/{$container}/{$action}");
        } catch (ConnectionException) {
            Inertia::flash('toast', ['type' => 'error', 'message' => 'Could not connect to Docker.']);

            return back();
        }

        // 304 means the container was already in the requested state.
        if ($response->failed()) {
            Inertia::flash('toast', [
                'type' => 'error',
                'message' => $response->json('message') ?? "Failed to {$action} container.",
            ]);

            return back();
        }

        $past = ['start' => 'started', 'stop' => 'stopped', 'restart' => 'restarted'][$action];

        $this->refreshStatusMenu();

        Inertia::flash('toast', ['type' => 'success', 'message' => "Container {$past}."]);

        return back();
    }

    /**
     * Start or stop the Caddy reverse proxy.
     */
    public function caddyAction(Caddy $caddy, string $action): RedirectResponse
    {
        if ($action === 'start' ? $caddy->start() : $caddy->stop()) {
            Inertia::flash('toast', ['type' => 'success', 'message' => $action === 'start' ? 'Caddy started.' : 'Caddy stopped.']);
        } else {
            Inertia::flash('toast', ['type' => 'error', 'message' => "Failed to {$action} Caddy."]);
        }

        $this->refreshStatusMenu();

        return back();
    }

    /**
     * The desktop app's menu bar icon shows the status of Caddy and the containers.
     */
    private function refreshStatusMenu(): void
    {
        if (config('nativephp-internal.running')) {
            defer(fn () => app(StatusMenu::class)->refresh());
        }
    }

    /**
     * Docker Desktop containers grouped by Docker Compose project, plus the saved
     * projects without containers (local projects, or Compose projects that are down).
     *
     * @return array<int, array<string, mixed>>
     */
    private function containers(): array
    {
        $projects = Project::all()->keyBy('project');

        $groups = collect($this->dockerContainers())
            ->groupBy(fn (array $container): string => $container['project'] ?? '')
            ->map(fn ($group) => $group->values()->all());

        foreach ($projects->keys() as $project) {
            if (! $groups->has($project)) {
                $groups->put($project, []);
            }
        }

        return $groups
            ->sortKeys()
            // Containers without a project (standalone) go last.
            ->sortBy(fn ($containers, string $project) => $project === '' ? 1 : 0)
            ->map(fn (array $containers, string $project) => [
                'project' => $project === '' ? null : $project,
                'details' => $projects->get($project)?->only([
                    'name', 'path', 'repository', 'information',
                    'url_local', 'url_dev', 'url_qa', 'url_staging', 'url_production',
                ]),
                'containers' => $containers,
            ])
            ->values()
            ->all();
    }

    /**
     * Containers from the Docker Engine API (Unix socket); none when Docker is unavailable.
     *
     * @return array<int, array<string, mixed>>
     */
    private function dockerContainers(): array
    {
        try {
            $response = $this->docker->http()
                ->timeout(3)
                ->get('http://localhost/containers/json', ['all' => 1]);
        } catch (ConnectionException) {
            return [];
        }

        if ($response->failed()) {
            return [];
        }

        return $response->collect()
            ->map(fn (array $container) => [
                'id' => substr($container['Id'], 0, 12),
                'project' => $container['Labels']['com.docker.compose.project'] ?? null,
                'service' => $container['Labels']['com.docker.compose.service'] ?? null,
                'name' => ltrim($container['Names'][0] ?? '', '/'),
                'image' => $container['Image'],
                'state' => $container['State'],
                'status' => $container['Status'],
                'ports' => $this->ports($container['Ports'] ?? []),
            ])
            ->sortBy('name')
            ->values()
            ->all();
    }

    /**
     * Docker Engine / host machine details.
     *
     * @return array<string, mixed>|null
     */
    private function host(): ?array
    {
        try {
            $response = $this->docker->http()->timeout(3)->get('http://localhost/info');
        } catch (ConnectionException) {
            return null;
        }

        if ($response->failed()) {
            return null;
        }

        return [
            'version' => $response->json('ServerVersion'),
            'os' => $response->json('OperatingSystem'),
            'cpus' => $response->json('NCPU'),
            'memory' => $response->json('MemTotal'),
            'images' => $response->json('Images'),
        ];
    }

    /**
     * CPU and memory usage of the running containers, like `docker stats`.
     *
     * @return array<string, mixed>|null
     */
    private function stats(): ?array
    {
        try {
            $response = $this->docker->http()->timeout(3)->get('http://localhost/containers/json');
        } catch (ConnectionException) {
            return null;
        }

        if ($response->failed()) {
            return null;
        }

        $names = $response->collect()
            ->mapWithKeys(fn (array $container) => [
                substr($container['Id'], 0, 12) => ltrim($container['Names'][0] ?? '', '/'),
            ]);

        $responses = Http::pool(fn (Pool $pool) => $names->keys()->map(
            fn (string $id) => $pool->as($id)
                ->withOptions($this->docker->options())
                ->timeout(5)
                ->get("http://localhost/containers/{$id}/stats", ['stream' => 'false'])
        )->all());

        $containers = $names
            ->map(function (string $name, string $id) use ($responses) {
                $response = $responses[$id] ?? null;

                if (! $response instanceof ClientResponse || $response->failed()) {
                    return null;
                }

                $stats = $response->json();

                $cpuDelta = ($stats['cpu_stats']['cpu_usage']['total_usage'] ?? 0)
                    - ($stats['precpu_stats']['cpu_usage']['total_usage'] ?? 0);
                $systemDelta = ($stats['cpu_stats']['system_cpu_usage'] ?? 0)
                    - ($stats['precpu_stats']['system_cpu_usage'] ?? 0);
                $cpus = $stats['cpu_stats']['online_cpus'] ?? 1;

                // Page cache is reclaimable, so `docker stats` leaves it out of memory usage.
                $memory = ($stats['memory_stats']['usage'] ?? 0)
                    - ($stats['memory_stats']['stats']['inactive_file'] ?? $stats['memory_stats']['stats']['cache'] ?? 0);

                return [
                    'name' => $name,
                    'cpu' => $systemDelta > 0 && $cpuDelta > 0 ? $cpuDelta / $systemDelta * $cpus * 100 : 0.0,
                    'memory' => max($memory, 0),
                ];
            })
            ->filter()
            ->values();

        return [
            'cpu' => round($containers->sum('cpu'), 1),
            'memory' => $containers->sum('memory'),
            'top' => $containers->sortByDesc('memory')->take(3)->values()->all(),
        ];
    }

    /**
     * Published ports of a container, each linked to its app when it serves HTTP.
     *
     * @param  array<int, array<string, mixed>>  $ports
     * @return array<int, array{label: string, url: string|null}>
     */
    private function ports(array $ports): array
    {
        return collect($ports)
            ->filter(fn (array $port) => isset($port['PublicPort']))
            ->unique(fn (array $port) => "{$port['PublicPort']}/{$port['Type']}")
            ->map(fn (array $port) => [
                'label' => "{$port['PublicPort']}:{$port['PrivatePort']}/{$port['Type']}",
                'url' => $this->portUrl($port),
            ])
            ->values()
            ->all();
    }

    /**
     * Build the URL of the application exposed on the port (TCP/HTTP only).
     *
     * @param  array<string, mixed>  $port
     */
    private function portUrl(array $port): ?string
    {
        if ($port['Type'] !== 'tcp' || in_array($port['PrivatePort'], self::NON_HTTP_PORTS, true)) {
            return null;
        }

        $host = in_array($port['IP'] ?? null, [null, '0.0.0.0', '::'], true) ? 'localhost' : $port['IP'];
        $scheme = in_array($port['PrivatePort'], [443, 8443], true) ? 'https' : 'http';

        return "{$scheme}://{$host}:{$port['PublicPort']}";
    }
}
