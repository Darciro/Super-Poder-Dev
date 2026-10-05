<?php

use App\Models\Project;
use App\Models\User;
use App\Services\TerminalSessions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia as Assert;
use Mockery\MockInterface;

beforeEach(function () {
    $this->actingAs(User::factory()->create());
});

test('a local project can be added', function () {
    $this->from(route('dashboard'))
        ->post(route('dashboard.projects.store'), [
            'name' => 'Newsletter Webhooker',
            'project' => 'newsletter-webhooker',
            'path' => sys_get_temp_dir().'/',
            'repository' => 'git@github.com:org/newsletter-webhooker.git',
            'information' => "Runs on port 8001.\nUses the shared MySQL.",
        ])
        ->assertRedirect(route('dashboard'))
        ->assertSessionHasNoErrors();

    expect(Project::firstWhere('project', 'newsletter-webhooker'))
        ->name->toBe('Newsletter Webhooker')
        ->path->toBe(rtrim(sys_get_temp_dir(), '/'))
        ->repository->toBe('git@github.com:org/newsletter-webhooker.git')
        ->information->toBe("Runs on port 8001.\nUses the shared MySQL.");
});

test('a local project needs a unique, url-safe project identifier', function (array $data, string $error) {
    Project::factory()->create(['project' => 'taken']);

    $this->post(route('dashboard.projects.store'), $data)->assertSessionHasErrors($error);

    expect(Project::count())->toBe(1);
})->with([
    'missing' => [['name' => 'No id'], 'project'],
    'taken' => [['project' => 'taken'], 'project'],
    'invalid characters' => [['project' => 'My Project!'], 'project'],
    'relative path' => [['project' => 'ok', 'path' => 'Projects/ok'], 'path'],
    'missing directory' => [['project' => 'ok', 'path' => '/this/does/not/exist'], 'path'],
]);

test('the details of a docker project are created on first save', function () {
    $this->put(route('dashboard.projects.update', 'p360-clube-front'), [
        'name' => 'Clube Poder360',
        'path' => sys_get_temp_dir(),
        'repository' => 'https://github.com/org/p360-clube-front',
        'information' => 'Front end of the club.',
    ])->assertSessionHasNoErrors();

    expect(Project::firstWhere('project', 'p360-clube-front'))
        ->name->toBe('Clube Poder360')
        ->repository->toBe('https://github.com/org/p360-clube-front');
});

test('saving again updates the same project and fields can be cleared', function () {
    Project::factory()->create(['project' => 'pbtv']);

    $this->put(route('dashboard.projects.update', 'pbtv'), ['name' => 'PBTV', 'path' => '', 'repository' => '', 'information' => ''])
        ->assertSessionHasNoErrors();

    expect(Project::where('project', 'pbtv')->count())->toBe(1)
        ->and(Project::firstWhere('project', 'pbtv'))
        ->name->toBe('PBTV')
        ->path->toBeNull()
        ->repository->toBeNull()
        ->information->toBeNull();
});

test('the dashboard lists docker and local projects with their details', function () {
    Http::fake([
        'localhost/containers/json*' => Http::response([[
            'Id' => 'abc123abc123abc123',
            'Names' => ['/pbtv-web-1'],
            'Image' => 'nginx',
            'State' => 'running',
            'Status' => 'Up',
            'Labels' => ['com.docker.compose.project' => 'pbtv'],
            'Ports' => [],
        ]]),
        '*' => Http::response([]),
    ]);

    Project::factory()->create(['project' => 'pbtv', 'name' => 'PBTV', 'path' => '/Users/me/Projects/pbtv']);
    Project::factory()->create(['project' => 'newsletter', 'name' => 'Newsletter', 'path' => '/Users/me/Projects/newsletter']);

    $this->get(route('dashboard'))
        ->assertInertia(fn (Assert $page) => $page
            ->has('containers', 2)
            ->where('containers.0.project', 'newsletter')
            ->where('containers.0.details.name', 'Newsletter')
            ->where('containers.0.containers', [])
            ->where('containers.1.project', 'pbtv')
            ->where('containers.1.details.path', '/Users/me/Projects/pbtv')
            ->has('containers.1.containers', 1)
        );
});

test('local projects are listed even when docker is unavailable', function () {
    Http::fake(['*' => Http::failedConnection()]);

    Project::factory()->create(['project' => 'newsletter']);

    $this->get(route('dashboard'))
        ->assertInertia(fn (Assert $page) => $page
            ->has('containers', 1)
            ->where('containers.0.project', 'newsletter')
        );
});

test('a project can be deleted, ending its local terminal session', function () {
    Project::factory()->create(['project' => 'newsletter']);
    Project::factory()->create(['project' => 'other']);

    $this->mock(TerminalSessions::class, fn (MockInterface $mock) => $mock
        ->shouldReceive('stop')->once()->with('project-newsletter'));

    $this->from(route('dashboard'))
        ->delete(route('dashboard.projects.destroy', 'newsletter'))
        ->assertRedirect(route('dashboard'));

    expect(Project::pluck('project')->all())->toBe(['other']);
});

test('guests cannot delete projects', function () {
    Project::factory()->create(['project' => 'newsletter']);

    auth()->logout();

    $this->delete(route('dashboard.projects.destroy', 'newsletter'))->assertRedirect(route('login'));

    expect(Project::count())->toBe(1);
});

test('a project path is opened in the configured ide', function () {
    Process::fake();
    config(['services.ide.command' => 'code']);
    Project::factory()->create(['project' => 'app', 'path' => sys_get_temp_dir()]);

    $this->from(route('dashboard'))
        ->post(route('dashboard.projects.open-ide', 'app'))
        ->assertRedirect(route('dashboard'));

    Process::assertRan(fn ($process) => $process->command === 'code '.escapeshellarg(sys_get_temp_dir()));
});

test('a project without a local path is not opened in the ide', function () {
    Process::fake();
    Project::factory()->create(['project' => 'app', 'path' => null]);

    $this->post(route('dashboard.projects.open-ide', 'app'));

    Process::assertNothingRan();
});

test('environment urls are saved with the project details', function () {
    $this->put(route('dashboard.projects.update', 'pbtv'), [
        'url_local' => 'http://localhost:8000',
        'url_dev' => 'http://pbtv.test',
        'url_qa' => 'https://qa.pbtv.com',
        'url_staging' => '',
        'url_production' => 'https://pbtv.com',
    ])->assertSessionHasNoErrors();

    expect(Project::firstWhere('project', 'pbtv'))
        ->url_local->toBe('http://localhost:8000')
        ->url_dev->toBe('http://pbtv.test')
        ->url_qa->toBe('https://qa.pbtv.com')
        ->url_staging->toBeNull()
        ->url_production->toBe('https://pbtv.com');
});

test('environment urls must be http or https urls', function (string $url) {
    $this->put(route('dashboard.projects.update', 'pbtv'), ['url_production' => $url])
        ->assertSessionHasErrors('url_production');
})->with(['not a url', 'javascript:alert(1)', 'ftp://pbtv.com']);
