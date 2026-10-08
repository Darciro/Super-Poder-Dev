<?php

use App\Models\Project;
use App\Models\User;
use App\Services\TerminalSessions;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Mockery\MockInterface;
use Native\Desktop\Facades\ChildProcess;

test('guests cannot use terminals', function () {
    $this->postJson(route('dashboard.containers.terminal.store', 'abc123'), ['cols' => 80, 'rows' => 24])
        ->assertUnauthorized();
});

test('starting a terminal starts the container session with the terminal size', function () {
    $this->mock(TerminalSessions::class, fn (MockInterface $mock) => $mock
        ->shouldReceive('start')->once()->with('abc123', ['type' => 'container', 'container' => 'abc123'], 120, 40));

    $this->actingAs(User::factory()->create())
        ->postJson(route('dashboard.containers.terminal.store', 'abc123'), ['cols' => 120, 'rows' => 40])
        ->assertNoContent();
});

test('terminal routes only accept container ids', function () {
    $this->mock(TerminalSessions::class, fn (MockInterface $mock) => $mock->shouldNotReceive('start'));

    $this->actingAs(User::factory()->create())
        ->postJson('/dashboard/containers/..%2F..%2Fetc/terminal', ['cols' => 80, 'rows' => 24])
        ->assertNotFound();
});

test('terminal output is returned base64 encoded', function () {
    $this->mock(TerminalSessions::class, fn (MockInterface $mock) => $mock
        ->shouldReceive('output')->once()->with('abc123', 'session-1', 10)
        ->andReturn(['session' => 'session-1', 'data' => "\e[32mok\e[0m", 'offset' => 21, 'running' => true]));

    $this->actingAs(User::factory()->create())
        ->getJson(route('dashboard.containers.terminal.output', ['abc123', 'session' => 'session-1', 'offset' => 10]))
        ->assertOk()
        ->assertExactJson([
            'session' => 'session-1',
            'data' => base64_encode("\e[32mok\e[0m"),
            'offset' => 21,
            'running' => true,
        ]);
});

test('input is sent to a running session', function () {
    $this->mock(TerminalSessions::class, function (MockInterface $mock) {
        $mock->shouldReceive('isRunning')->with('abc123')->andReturnTrue();
        $mock->shouldReceive('input')->once()->with('abc123', "ls -la\r");
    });

    $this->actingAs(User::factory()->create())
        ->postJson(route('dashboard.containers.terminal.input', 'abc123'), ['data' => base64_encode("ls -la\r")])
        ->assertNoContent();
});

test('input is rejected when the session has ended', function () {
    $this->mock(TerminalSessions::class, function (MockInterface $mock) {
        $mock->shouldReceive('isRunning')->with('abc123')->andReturnFalse();
        $mock->shouldNotReceive('input');
    });

    $this->actingAs(User::factory()->create())
        ->postJson(route('dashboard.containers.terminal.input', 'abc123'), ['data' => base64_encode('ls')])
        ->assertConflict();
});

test('a lone enter or space reaches the shell untouched', function (string $key) {
    $this->mock(TerminalSessions::class, function (MockInterface $mock) use ($key) {
        $mock->shouldReceive('isRunning')->andReturnTrue();
        $mock->shouldReceive('input')->once()->with('abc123', $key);
    });

    $this->actingAs(User::factory()->create())
        ->postJson(route('dashboard.containers.terminal.input', 'abc123'), ['data' => base64_encode($key)])
        ->assertNoContent();
})->with(['enter' => "\r", 'space' => ' ']);

test('ending a terminal stops the session', function () {
    $this->mock(TerminalSessions::class, fn (MockInterface $mock) => $mock
        ->shouldReceive('stop')->once()->with('abc123'));

    $this->actingAs(User::factory()->create())
        ->deleteJson(route('dashboard.containers.terminal.destroy', 'abc123'))
        ->assertNoContent();
});

test('session output resumes from the offset and restarts for a new session', function () {
    $sessions = app(TerminalSessions::class);
    $container = 'test'.bin2hex(random_bytes(4));

    File::ensureDirectoryExists($sessions->path($container));
    File::put($sessions->path($container, 'session.json'), json_encode(['id' => 'current', 'pid' => 0]));
    File::put($sessions->path($container, 'output.log'), 'hello world');

    try {
        expect($sessions->output($container, 'current', 6))
            ->toMatchArray(['session' => 'current', 'data' => 'world', 'offset' => 11, 'running' => false])
            // Output of an older session: replay the current one from the start.
            ->and($sessions->output($container, 'old', 6))
            ->toMatchArray(['data' => 'hello world', 'offset' => 11]);
    } finally {
        File::deleteDirectory($sessions->path($container));
    }
});

test('a project terminal opens a local shell in the project location', function () {
    Project::factory()->create(['project' => 'p360-clube-front', 'path' => '/Users/me/Projects/p360-clube-front']);

    $this->mock(TerminalSessions::class, fn (MockInterface $mock) => $mock
        ->shouldReceive('start')->once()->with(
            'project-p360-clube-front',
            ['type' => 'local', 'cwd' => '/Users/me/Projects/p360-clube-front'],
            100,
            30,
        ));

    $this->actingAs(User::factory()->create())
        ->postJson(route('dashboard.projects.terminal.store', 'p360-clube-front'), ['cols' => 100, 'rows' => 30])
        ->assertNoContent();
});

test('a project terminal without a location opens in the home folder', function () {
    $this->mock(TerminalSessions::class, fn (MockInterface $mock) => $mock
        ->shouldReceive('start')->once()->with('project-pbtv', ['type' => 'local', 'cwd' => getenv('HOME')], 100, 30));

    $this->actingAs(User::factory()->create())
        ->postJson(route('dashboard.projects.terminal.store', 'pbtv'), ['cols' => 100, 'rows' => 30])
        ->assertNoContent();
});

test('project terminal endpoints use the project session', function () {
    $this->mock(TerminalSessions::class, function (MockInterface $mock) {
        $mock->shouldReceive('isRunning')->with('project-pbtv')->andReturnTrue();
        $mock->shouldReceive('input')->once()->with('project-pbtv', "ls\r");
        $mock->shouldReceive('stop')->once()->with('project-pbtv');
    });

    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson(route('dashboard.projects.terminal.input', 'pbtv'), ['data' => base64_encode("ls\r")])
        ->assertNoContent();

    $this->actingAs($user)
        ->deleteJson(route('dashboard.projects.terminal.destroy', 'pbtv'))
        ->assertNoContent();
});

test('project terminal routes only accept project names', function () {
    $this->mock(TerminalSessions::class, fn (MockInterface $mock) => $mock->shouldNotReceive('start'));

    $this->actingAs(User::factory()->create())
        ->postJson('/dashboard/projects/..%2Fetc/terminal', ['cols' => 80, 'rows' => 24])
        ->assertNotFound();
});

test('a session runs while its process holds the claim', function () {
    $sessions = app(TerminalSessions::class);
    $key = 'test'.bin2hex(random_bytes(4));

    try {
        expect($sessions->isRunning($key))->toBeFalse();

        $lock = $sessions->claim($key);

        expect($lock)->not->toBeNull()
            ->and($sessions->isRunning($key))->toBeTrue()
            ->and($sessions->active())->toContain($key);

        fclose($lock);

        expect($sessions->isRunning($key))->toBeFalse();
    } finally {
        File::deleteDirectory($sessions->path($key));
    }
});

test('stopping asks a running session to end', function () {
    $sessions = app(TerminalSessions::class);
    $key = 'test'.bin2hex(random_bytes(4));

    try {
        // Nothing to stop: no request is left behind for a later session.
        $sessions->stop($key);

        expect($sessions->stopRequested($key))->toBeFalse();

        $lock = $sessions->claim($key);
        $sessions->stop($key);

        expect($sessions->stopRequested($key))->toBeTrue();

        fclose($lock);
    } finally {
        File::deleteDirectory($sessions->path($key));
    }
});

test('in the desktop app a session runs as a child process of the app', function () {
    inDesktopApp();
    Process::fake();
    $sessions = app(TerminalSessions::class);
    $key = 'project-test'.bin2hex(random_bytes(4));
    $lock = null;

    // The started process takes the session over, as terminal:run does.
    ChildProcess::shouldReceive('artisan')
        ->once()
        ->with(['terminal:run', $key], "terminal-{$key}")
        ->andReturnUsing(function () use ($sessions, $key, &$lock) {
            $lock = $sessions->claim($key);

            return Mockery::mock(Native\Desktop\ChildProcess::class);
        });

    try {
        $sessions->start($key, ['type' => 'local', 'cwd' => '/tmp'], 80, 24);

        expect($sessions->isRunning($key))->toBeTrue();
        Process::assertNothingRan();
    } finally {
        $lock && fclose($lock);
        File::deleteDirectory($sessions->path($key));
    }
});

test('in a browser a session runs on its own, surviving the dev server', function () {
    $sessions = app(TerminalSessions::class);
    $key = 'project-test'.bin2hex(random_bytes(4));
    $lock = null;

    Process::fake(function () use ($sessions, $key, &$lock) {
        $lock = $sessions->claim($key);

        return Process::result('4242');
    });

    try {
        $sessions->start($key, ['type' => 'local', 'cwd' => '/tmp'], 80, 24);

        Process::assertRan(fn ($process) => str_starts_with($process->command, 'nohup ') && str_contains($process->command, "terminal:run '{$key}'"));
        expect($sessions->session($key)['pid'])->toBe(4242);
    } finally {
        $lock && fclose($lock);
        File::deleteDirectory($sessions->path($key));
    }
});
