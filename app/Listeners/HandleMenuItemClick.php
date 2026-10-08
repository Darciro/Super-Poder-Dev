<?php

namespace App\Listeners;

use App\Native\MainWindow;
use App\Native\StatusMenu;
use App\Services\Caddy;
use Native\Desktop\Events\Menu\MenuItemClicked;
use Native\Desktop\Facades\Notification;

/**
 * Actions of the menu bar icon (StatusMenu).
 *
 * The window may be closed meanwhile, so results show as system notifications.
 */
class HandleMenuItemClick
{
    public function __construct(private Caddy $caddy, private StatusMenu $statusMenu) {}

    public function handle(MenuItemClicked $event): void
    {
        match ($event->item['id'] ?? null) {
            StatusMenu::OPEN_DASHBOARD => MainWindow::open(),
            StatusMenu::START_CADDY => $this->caddy('start'),
            StatusMenu::STOP_CADDY => $this->caddy('stop'),
            default => null,
        };
    }

    private function caddy(string $action): void
    {
        $done = $action === 'start' ? $this->caddy->start() : $this->caddy->stop();

        Notification::title('Caddy')
            ->message(match (true) {
                $done && $action === 'start' => 'Caddy started.',
                $done => 'Caddy stopped.',
                default => "Could not {$action} Caddy.",
            })
            ->show();

        $this->statusMenu->refresh();
    }
}
