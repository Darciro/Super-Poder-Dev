<?php

use App\Models\User;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
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
