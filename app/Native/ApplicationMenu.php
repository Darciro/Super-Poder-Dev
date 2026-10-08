<?php

namespace App\Native;

use Native\Desktop\Facades\Menu;

/**
 * The desktop app's menu in the macOS menu bar, with shortcuts to its pages.
 */
class ApplicationMenu
{
    public static function register(): void
    {
        Menu::create(
            Menu::app(),
            Menu::edit(),
            Menu::make(
                Menu::route('dashboard', 'Dashboard', 'CmdOrCtrl+1'),
                Menu::route('documentation.index', 'Documentation', 'CmdOrCtrl+2'),
                Menu::separator(),
                Menu::route('profile.edit', 'Settings', 'CmdOrCtrl+,'),
                Menu::route('integrations.edit', 'Integrations'),
                Menu::route('data.edit', 'Export & Import Data'),
            )->label('Go'),
            Menu::view(),
            Menu::window(),
        );
    }
}
