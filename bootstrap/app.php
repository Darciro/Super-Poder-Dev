<?php

use App\Http\Middleware\AuthenticateDesktopUser;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Native\Desktop\Http\Middleware\PreventRegularBrowserAccess;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->trustProxies(at: '127.0.0.1');

        // In the desktop app, only its own window may reach the app (it signs in the user
        // without a login). NativePHP registers this itself, but too early: the middleware
        // configured here replaces it. Does nothing outside the desktop app.
        $middleware->append(PreventRegularBrowserAccess::class);

        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        $middleware->web(append: [
            AuthenticateDesktopUser::class,
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);

        // Signs in the desktop app's user before the `auth` middleware checks for one.
        $middleware->prependToPriorityList(AuthenticatesRequests::class, AuthenticateDesktopUser::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
