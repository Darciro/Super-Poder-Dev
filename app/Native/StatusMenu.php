<?php

namespace App\Native;

use App\Services\Caddy;
use App\Services\Docker;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Native\Desktop\Facades\Menu;
use Native\Desktop\Facades\MenuBar;
use Native\Desktop\Menu\Menu as NativeMenu;

/**
 * The desktop app's menu bar icon: status of Caddy and the containers, quick actions,
 * and a way back to the window once it's closed (the app keeps running).
 *
 * Its items are handled by HandleMenuItemClick.
 */
class StatusMenu
{
    public const OPEN_DASHBOARD = 'status-menu.open-dashboard';

    public const START_CADDY = 'status-menu.start-caddy';

    public const STOP_CADDY = 'status-menu.stop-caddy';

    public function __construct(private Caddy $caddy, private Docker $docker) {}

    /**
     * Create the menu bar icon, once per launch of the app.
     *
     * The app boots again when its Dock icon is clicked without an open window, and
     * NativePHP doesn't replace a context-menu-only icon: it would add another one.
     */
    public function create(): void
    {
        // Random for each launch of the app.
        $launch = (string) config('nativephp-internal.secret');

        if (Cache::get('status-menu.launch') === $launch) {
            return;
        }

        MenuBar::create()
            ->onlyShowContextMenu()
            // The app has a window too: keep it in the Dock.
            ->showDockIcon()
            ->tooltip(config('app.name'))
            ->withContextMenu($this->menu());

        Cache::forever('status-menu.launch', $launch);
    }

    /**
     * Update the status shown in the menu.
     */
    public function refresh(): void
    {
        MenuBar::contextMenu($this->menu());
    }

    public function menu(): NativeMenu
    {
        $caddy = $this->caddy->running();
        $containers = $this->runningContainers();

        return Menu::make(
            Menu::label('Open Dashboard')->id(self::OPEN_DASHBOARD),
            Menu::separator(),
            Menu::label($caddy ? 'Caddy: running' : 'Caddy: stopped')->disabled(),
            $caddy
                ? Menu::label('Stop Caddy')->id(self::STOP_CADDY)
                : Menu::label('Start Caddy')->id(self::START_CADDY),
            Menu::separator(),
            Menu::label(match (true) {
                $containers === null => 'Docker: not running',
                $containers === 1 => '1 container running',
                default => "{$containers} containers running",
            })->disabled(),
            Menu::separator(),
            Menu::quit('Quit '.config('app.name')),
        );
    }

    /**
     * Number of running containers, null when Docker can't be reached.
     */
    private function runningContainers(): ?int
    {
        try {
            $response = $this->docker->http()->timeout(3)->get('http://localhost/containers/json');
        } catch (ConnectionException) {
            return null;
        }

        $containers = $response->successful() ? $response->json() : null;

        return is_array($containers) ? count($containers) : null;
    }
}
