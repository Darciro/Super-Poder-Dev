<?php

namespace App\Providers;

use App\Native\ApplicationMenu;
use App\Native\MainWindow;
use App\Native\StatusMenu;
use Native\Desktop\Contracts\ProvidesPhpIni;

class NativeAppServiceProvider implements ProvidesPhpIni
{
    /**
     * Executed once the native application has been booted.
     * Use this method to open windows, register global shortcuts, etc.
     *
     * Also when its Dock icon is clicked without an open window: closing the window
     * doesn't quit the app (it stays in the menu bar).
     */
    public function boot(): void
    {
        ApplicationMenu::register();

        app(StatusMenu::class)->create();

        MainWindow::open();
    }

    /**
     * Return an array of php.ini directives to be set.
     *
     * @return array<string, string>
     */
    public function phpIni(): array
    {
        return [
            'memory_limit' => '512M',
        ];
    }
}
