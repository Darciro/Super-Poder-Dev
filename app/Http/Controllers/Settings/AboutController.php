<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use Illuminate\Foundation\Application;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The app's version and the platform it runs on.
 */
class AboutController extends Controller
{
    public function show(): Response
    {
        return Inertia::render('settings/about', [
            'about' => [
                'name' => config('app.name'),
                // NATIVEPHP_APP_VERSION in .env, also used by the desktop build.
                'version' => config('nativephp.version'),
                'environment' => app()->environment(),
                'laravel' => Application::VERSION,
                'php' => PHP_VERSION,
            ],
        ]);
    }
}
