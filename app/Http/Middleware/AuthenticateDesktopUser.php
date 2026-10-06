<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * In the desktop app there's a single local user and no login: sign them in on every
 * request, creating them on first launch.
 *
 * Only inside the desktop app, where NativePHP already rejects requests that don't come
 * from its own window. In a browser the usual login still applies: the dashboard opens
 * shells on this machine, and the dev server may be reachable from the network.
 */
class AuthenticateDesktopUser
{
    public function handle(Request $request, Closure $next): Response
    {
        if (config('nativephp-internal.running') && ! Auth::check()) {
            Auth::login($this->user());
        }

        return $next($request);
    }

    private function user(): User
    {
        $user = User::oldest('id')->first() ?? $this->createUser();

        // There's no inbox to verify it from (the dashboard requires it).
        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
        }

        return $user;
    }

    /**
     * The user of this Mac: named after its account ("Jane Doe", jane@localhost).
     */
    private function createUser(): User
    {
        $account = get_current_user() ?: 'developer';
        $fullName = trim(Process::run(['id', '-F'])->output());

        return User::create([
            'name' => $fullName ?: Str::headline($account),
            'email' => Str::slug($account).'@localhost',
            // Never typed: there's no login screen in the desktop app.
            'password' => Str::random(64),
        ]);
    }
}
