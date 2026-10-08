<?php

use App\Models\Project;
use App\Models\Setting;
use App\Models\User;
use App\Services\Docker;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->actingAs(User::factory()->create());
});

test('guests cannot see the integrations', function () {
    auth()->logout();

    $this->get(route('integrations.edit'))->assertRedirect(route('login'));
});

test('the integrations show the defaults and whether the tools are found', function () {
    config([
        'services.caddy.binary' => PHP_BINARY,
        'services.caddy.config' => '/nonexistent/Caddyfile',
    ]);
    Setting::create(['key' => 'ide_command', 'value' => 'cursor']);

    $this->get(route('integrations.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/integrations')
            ->where('settings.ide_command', ['value' => 'cursor', 'default' => config('services.ide.command'), 'found' => null])
            ->where('settings.caddy_binary.value', '')
            ->where('settings.caddy_binary.found', true)
            ->where('settings.caddy_config.found', false)
            ->where('settings.caddy_admin.default', config('services.caddy.admin'))
        );
});

test('integrations are saved, and an empty one goes back to its default', function () {
    Setting::create(['key' => 'caddy_admin', 'value' => 'http://localhost:2020']);

    $this->put(route('integrations.update'), [
        'docker_socket' => '/var/run/docker.sock',
        'caddy_binary' => PHP_BINARY,
        'caddy_config' => ' /Users/me/caddy/Caddyfile ',
        'caddy_admin' => '',
        'ide_command' => 'open -a "PhpStorm"',
    ])->assertRedirect(route('integrations.edit'));

    expect(Setting::pluck('value', 'key')->all())->toEqual([
        'docker_socket' => '/var/run/docker.sock',
        'caddy_binary' => PHP_BINARY,
        'caddy_config' => '/Users/me/caddy/Caddyfile',
        'ide_command' => 'open -a "PhpStorm"',
    ]);
});

test('integrations are validated', function () {
    $this->put(route('integrations.update'), [
        'docker_socket' => 'docker.sock',
        'caddy_binary' => '/nonexistent/caddy',
        'caddy_admin' => 'localhost:2019',
    ])->assertSessionHasErrors(['docker_socket', 'caddy_binary', 'caddy_admin']);

    expect(Setting::count())->toBe(0);
});

test('docker is reached through the saved socket', function () {
    Setting::create(['key' => 'docker_socket', 'value' => '/tmp/other-docker.sock']);

    expect(app(Docker::class)->socket())->toBe('/tmp/other-docker.sock');
});

test('projects open with the saved ide command', function () {
    Process::fake();
    Setting::create(['key' => 'ide_command', 'value' => 'cursor']);
    Project::factory()->create(['project' => 'app', 'path' => sys_get_temp_dir()]);

    $this->post(route('dashboard.projects.open-ide', 'app'));

    Process::assertRan(fn ($process) => $process->command === 'cursor '.escapeshellarg(sys_get_temp_dir()));
});

test('the dashboard lists the sites of the saved caddyfile', function () {
    $caddyfile = tempnam(sys_get_temp_dir(), 'Caddyfile');
    file_put_contents($caddyfile, "shop.test {\n    reverse_proxy 127.0.0.1:8000\n}\n");
    Setting::create(['key' => 'caddy_config', 'value' => $caddyfile]);
    Http::fake();
    Process::fake();

    try {
        $this->get(route('dashboard'))
            ->assertInertia(fn (Assert $page) => $page
                ->where('caddy.config', $caddyfile)
                ->where('caddy.sites.0.host', 'shop.test')
            );
    } finally {
        unlink($caddyfile);
    }
});
