<?php

use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia as Assert;

test('guests are redirected to the login page', function () {
    $response = $this->get(route('dashboard'));
    $response->assertRedirect(route('login'));
});

test('authenticated users can visit the dashboard', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $response = $this->get(route('dashboard'));
    $response->assertOk();
});

test('authenticated users can run container actions', function (string $action) {
    Http::fake(['localhost/containers/*' => Http::response(null, 204)]);

    $this->actingAs(User::factory()->create());

    $response = $this->from(route('dashboard'))
        ->post(route('dashboard.containers.action', ['container' => 'abc123', 'action' => $action]));

    $response->assertRedirect(route('dashboard'));

    Http::assertSent(fn (Request $request) => $request->method() === 'POST'
        && $request->url() === "http://localhost/containers/abc123/{$action}");
})->with(['start', 'stop', 'restart']);

test('invalid container actions are rejected', function () {
    Http::fake();

    $this->actingAs(User::factory()->create());

    $this->post('/dashboard/containers/abc123/remove')->assertNotFound();

    Http::assertNothingSent();
});

test('guests cannot run container actions', function () {
    Http::fake();

    $this->post(route('dashboard.containers.action', ['container' => 'abc123', 'action' => 'stop']))
        ->assertRedirect(route('login'));

    Http::assertNothingSent();
});

test('the dashboard shows docker host details and loads stats deferred', function () {
    Http::fake([
        'localhost/info' => Http::response([
            'ServerVersion' => '29.0.0',
            'OperatingSystem' => 'Docker Desktop',
            'NCPU' => 4,
            'MemTotal' => 8_000_000_000,
            'Images' => 3,
        ]),
        'localhost/containers/json*' => Http::response([[
            'Id' => 'abc123abc123abc123',
            'Names' => ['/app-web-1'],
            'Image' => 'nginx',
            'State' => 'running',
            'Status' => 'Up 1 hour',
            'Labels' => ['com.docker.compose.project' => 'app', 'com.docker.compose.service' => 'web'],
            'Ports' => [['IP' => '0.0.0.0', 'PrivatePort' => 80, 'PublicPort' => 8080, 'Type' => 'tcp']],
        ]]),
        'localhost/containers/abc123abc123/stats*' => Http::response([
            'cpu_stats' => ['cpu_usage' => ['total_usage' => 300], 'system_cpu_usage' => 2000, 'online_cpus' => 4],
            'precpu_stats' => ['cpu_usage' => ['total_usage' => 100], 'system_cpu_usage' => 1000],
            'memory_stats' => ['usage' => 600, 'stats' => ['inactive_file' => 100]],
        ]),
    ]);

    $this->actingAs(User::factory()->create());

    $this->get(route('dashboard'))
        ->assertInertia(fn (Assert $page) => $page
            ->component('dashboard')
            ->where('host.cpus', 4)
            ->where('containers.0.project', 'app')
            ->where('containers.0.containers.0.ports.0.url', 'http://localhost:8080')
            ->missing('stats')
            ->loadDeferredProps(fn (Assert $reload) => $reload
                ->where('stats.cpu', 80)
                ->where('stats.memory', 500)
                ->where('stats.top.0.name', 'app-web-1')
            )
        );
});

test('the dashboard lists php servers running from the terminal', function () {
    Http::fake();
    Process::fake([
        '*ps*' => Process::result(implode("\n", [
            '  101 /opt/homebrew/bin/php -S 127.0.0.1:8000 /Users/me/Projects/shop/vendor/laravel/framework/src/Illuminate/Foundation/Console/../resources/server.php',
            '  102 php -S 0.0.0.0:8001',
            '  103 grep php',
        ])),
        '*lsof*' => Process::result("p102\nfcwd\nn/Users/me/Projects/blog\n"),
    ]);

    $this->actingAs(User::factory()->create());

    $this->get(route('dashboard'))
        ->assertInertia(fn (Assert $page) => $page
            ->has('localServers', 2)
            ->where('localServers.0.name', 'shop')
            ->where('localServers.0.url', 'http://127.0.0.1:8000')
            ->where('localServers.1.path', '/Users/me/Projects/blog')
            ->where('localServers.1.url', 'http://localhost:8001')
        );
});

test('the dashboard shows the caddy hosts and status', function () {
    $caddyfile = tempnam(sys_get_temp_dir(), 'Caddyfile');
    file_put_contents($caddyfile, <<<'CADDY'
        {
            admin localhost:2019
        }

        # Main app
        app.test, www.app.test {
            tls internal
            reverse_proxy 127.0.0.1:8888
        }

        app.test:5173 {
            reverse_proxy 127.0.0.1:5174
        }

        http://plain.test {
            reverse_proxy localhost:3000 localhost:3001
        }
        CADDY);
    config(['services.caddy.config' => $caddyfile]);

    Http::fake(['localhost:2019/config/' => Http::response([])]);

    $this->actingAs(User::factory()->create());

    $this->get(route('dashboard'))
        ->assertInertia(fn (Assert $page) => $page
            ->where('caddy.running', true)
            ->has('caddy.sites', 4)
            ->where('caddy.sites.0.host', 'app.test')
            ->where('caddy.sites.0.port', 443)
            ->where('caddy.sites.1.upstreams', ['127.0.0.1:8888'])
            ->where('caddy.sites.2.port', 5173)
            ->where('caddy.sites.3.port', 80)
            ->where('caddy.sites.3.upstreams', ['localhost:3000', 'localhost:3001'])
        );

    unlink($caddyfile);
});

test('the dashboard reports caddy as stopped when its admin api is down', function () {
    config(['services.caddy.config' => '/nonexistent/Caddyfile']);

    Http::fake(['localhost:2019/*' => fn () => throw new ConnectionException]);

    $this->actingAs(User::factory()->create());

    $this->get(route('dashboard'))
        ->assertInertia(fn (Assert $page) => $page
            ->where('caddy.running', false)
            ->where('caddy.exists', false)
            ->has('caddy.sites', 0)
        );
});

test('caddy is stopped through its admin api', function () {
    Http::fake(['localhost:2019/stop' => Http::response()]);

    $this->actingAs(User::factory()->create());

    $this->from(route('dashboard'))
        ->post(route('dashboard.caddy.action', ['action' => 'stop']))
        ->assertRedirect(route('dashboard'));

    Http::assertSent(fn (Request $request) => $request->method() === 'POST'
        && $request->url() === 'http://localhost:2019/stop');
});

test('caddy is started as root with its caddyfile', function () {
    Process::fake();
    config(['services.caddy.config' => '/Users/me/caddy/Caddyfile']);

    $this->actingAs(User::factory()->create());

    $this->from(route('dashboard'))
        ->post(route('dashboard.caddy.action', ['action' => 'start']))
        ->assertRedirect(route('dashboard'));

    Process::assertRan(fn ($process) => $process->command[0] === 'sudo'
        && str_contains($process->command[4], "start --config '/Users/me/caddy/Caddyfile'"));
});

test('invalid caddy actions are rejected', function () {
    Process::fake();

    $this->actingAs(User::factory()->create());

    $this->post('/dashboard/caddy/restart')->assertNotFound();

    Process::assertNothingRan();
});
