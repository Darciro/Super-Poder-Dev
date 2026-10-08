<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Native\Desktop\Facades\Shell;

/**
 * Bridges from the desktop app's window to the operating system.
 */
class NativeController extends Controller
{
    /**
     * Open a link in the default browser instead of a new window of the app.
     */
    public function openExternal(Request $request): Response
    {
        abort_unless(config('nativephp-internal.running'), 404);

        $validated = $request->validate([
            'url' => ['required', 'string', 'url:http,https', 'max:2048'],
        ]);

        Shell::openExternal($validated['url']);

        return response()->noContent();
    }
}
