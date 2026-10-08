<?php

namespace App\Native;

use Native\Desktop\Facades\Window;

/**
 * The desktop app's window, showing the dashboard.
 */
class MainWindow
{
    public const ID = 'main';

    /**
     * Open the window, or bring it to the front when it's already open.
     */
    public static function open(): void
    {
        Window::open(self::ID)
            ->title(config('app.name'))
            ->route('dashboard')
            ->width(1280)
            ->height(820)
            ->minWidth(960)
            ->minHeight(600)
            ->rememberState()
            // Links that leave the app open in the browser instead (resources/js/lib/native.ts).
            ->suppressNewWindows();
    }
}
