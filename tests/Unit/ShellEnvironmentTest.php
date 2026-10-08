<?php

use App\Services\ShellEnvironment;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

uses(TestCase::class);

test('programs get the PATH of the login shell', function () {
    Process::fake(['*' => "Welcome!\n__SHELL_ENVIRONMENT_PATH__/opt/homebrew/bin:/usr/bin__SHELL_ENVIRONMENT_PATH__"]);

    $path = explode(':', app(ShellEnvironment::class)->path());

    expect(array_slice($path, 0, 2))->toBe(['/opt/homebrew/bin', '/usr/bin'])
        ->and($path)->toHaveCount(count(array_unique($path)));
});

test('common install locations are added when the login shell does not answer', function () {
    Process::fake(['*' => Process::result(exitCode: 1)]);

    expect(explode(':', app(ShellEnvironment::class)->path()))
        ->toContain('/opt/homebrew/bin', '/usr/local/bin');
});

test('programs only get the user variables', function () {
    Process::fake(['*' => '']);
    putenv('APP_KEY_FOR_TEST=secret');

    try {
        $environment = app(ShellEnvironment::class);

        expect($environment->variables())->toHaveKeys(['HOME', 'PATH'])->not->toHaveKey('APP_KEY_FOR_TEST')
            ->and($environment->replacing())->toMatchArray(['APP_KEY_FOR_TEST' => false]);
    } finally {
        putenv('APP_KEY_FOR_TEST');
    }
});
