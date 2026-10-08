<?php

use App\Services\Caddy;
use Mockery\MockInterface;

test('caddy:start does nothing when Caddy is already running', function () {
    $this->mock(Caddy::class, function (MockInterface $mock) {
        $mock->shouldReceive('running')->once()->andReturnTrue();
        $mock->shouldNotReceive('start');
    });

    $this->artisan('caddy:start')
        ->expectsOutputToContain('Caddy is already running.')
        ->assertSuccessful();
});

test('caddy:start starts Caddy when it is stopped', function (bool $started, int $exitCode) {
    $this->mock(Caddy::class, function (MockInterface $mock) use ($started) {
        $mock->shouldReceive('running')->once()->andReturnFalse();
        $mock->shouldReceive('start')->once()->andReturn($started);
    });

    $this->artisan('caddy:start')->assertExitCode($exitCode);
})->with([
    'started' => [true, 0],
    'failed' => [false, 1],
]);
