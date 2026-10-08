<?php

use App\Listeners\HandleMenuItemClick;
use App\Models\User;
use App\Native\StatusMenu;
use App\Services\Caddy;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Mockery\MockInterface;
use Native\Desktop\Events\Menu\MenuItemClicked;

/**
 * Requests sent to the desktop app (Electron's API), by endpoint.
 *
 * @return array<int, array<string, mixed>>
 */
function sentToApp(string $endpoint): array
{
    return Http::recorded(fn (Request $request) => str_ends_with($request->url(), "/api/{$endpoint}"))
        ->map(fn (array $pair) => $pair[0]->data())
        ->values()
        ->all();
}

/**
 * Labels of the items of a menu sent to the app, without the separators.
 *
 * @param  array<int, array<string, mixed>>  $items
 * @return array<int, string>
 */
function menuLabels(array $items): array
{
    return collect($items)->pluck('label')->filter()->values()->all();
}

beforeEach(function () {
    inDesktopApp();
    config(['nativephp-internal.api_url' => 'http://electron.test/api/']);
});

test('the menu bar shows the status of caddy and the containers', function () {
    Http::fake([
        'localhost:2019/*' => Http::response(),
        'localhost/containers/json' => Http::response([['Id' => 'a'], ['Id' => 'b']]),
        '*' => Http::response(),
    ]);

    app(StatusMenu::class)->refresh();

    expect(menuLabels(sentToApp('menu-bar/context-menu')[0]['contextMenu']))->toBe([
        'Open Dashboard', 'Caddy: running', 'Stop Caddy', '2 containers running', 'Quit '.config('app.name'),
    ]);
});

test('the menu bar tells when caddy and docker are not running', function () {
    Http::fake([
        'localhost:2019/*' => Http::failedConnection(),
        'localhost/*' => Http::failedConnection(),
        '*' => Http::response(),
    ]);

    app(StatusMenu::class)->refresh();

    expect(menuLabels(sentToApp('menu-bar/context-menu')[0]['contextMenu']))
        ->toContain('Caddy: stopped', 'Start Caddy', 'Docker: not running');
});

test('the menu bar icon is created once per launch of the app, keeping the dock icon', function () {
    Http::fake();

    // The app boots again when its Dock icon is clicked without an open window.
    app(StatusMenu::class)->create();
    app(StatusMenu::class)->create();

    expect(sentToApp('menu-bar/create'))->toHaveCount(1)
        ->and(sentToApp('menu-bar/create')[0])->toMatchArray(['onlyShowContextMenu' => true, 'showDockIcon' => true]);

    // Next launch.
    config(['nativephp-internal.secret' => 'another-launch']);
    app(StatusMenu::class)->create();

    expect(sentToApp('menu-bar/create'))->toHaveCount(2);
});

test('open dashboard brings the window back', function () {
    Http::fake();

    app(HandleMenuItemClick::class)->handle(new MenuItemClicked(['id' => StatusMenu::OPEN_DASHBOARD]));

    expect(sentToApp('window/open')[0])->toMatchArray(['id' => 'main']);
});

test('caddy is started from the menu bar, with a notification of the result', function (bool $started, string $message) {
    Http::fake();
    $this->mock(Caddy::class, function (MockInterface $mock) use ($started) {
        $mock->shouldReceive('start')->once()->andReturn($started);
        $mock->shouldReceive('running')->andReturn($started);
    });

    app(HandleMenuItemClick::class)->handle(new MenuItemClicked(['id' => StatusMenu::START_CADDY]));

    expect(sentToApp('notification')[0])->toMatchArray(['title' => 'Caddy', 'body' => $message])
        ->and(sentToApp('menu-bar/context-menu'))->toHaveCount(1);
})->with([
    'started' => [true, 'Caddy started.'],
    'failed' => [false, 'Could not start Caddy.'],
]);

test('dashboard actions update the menu bar', function () {
    Http::fake();
    $this->mock(Caddy::class, function (MockInterface $mock) {
        $mock->shouldReceive('stop')->once()->andReturnTrue();
        $mock->shouldReceive('running')->andReturnFalse();
    });

    $this->actingAs(User::factory()->create())
        ->post(route('dashboard.caddy.action', 'stop'))
        ->assertRedirect();

    expect(sentToApp('menu-bar/context-menu'))->toHaveCount(1);
});
