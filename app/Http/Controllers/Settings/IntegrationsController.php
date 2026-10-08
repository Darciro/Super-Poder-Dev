<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Services\IntegrationSettings;
use Closure;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Where the dashboard finds Docker, Caddy and the IDE.
 */
class IntegrationsController extends Controller
{
    public function edit(IntegrationSettings $settings): Response
    {
        $stored = $settings->stored();

        return Inertia::render('settings/integrations', [
            'settings' => collect(IntegrationSettings::DEFAULTS)
                ->keys()
                ->mapWithKeys(fn (string $key) => [$key => [
                    'value' => $stored[$key] ?? '',
                    'default' => $settings->default($key),
                    'found' => $this->found($key, $settings->get($key)),
                ]])
                ->all(),
        ]);
    }

    public function update(Request $request, IntegrationSettings $settings): RedirectResponse
    {
        $absolutePath = ['nullable', 'string', 'max:1024', 'starts_with:/'];

        $validated = $request->validate([
            'docker_socket' => $absolutePath,
            'caddy_binary' => [...$absolutePath, function (string $attribute, mixed $value, Closure $fail) {
                if (! is_file($value) || ! is_executable($value)) {
                    $fail('No executable file at this path.');
                }
            }],
            'caddy_config' => $absolutePath,
            'caddy_admin' => ['nullable', 'string', 'max:255', 'url:http,https'],
            'ide_command' => ['nullable', 'string', 'max:255'],
        ], [
            'starts_with' => 'Use an absolute path (starting with /).',
        ]);

        $settings->save($validated);

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Integrations saved.']);

        return to_route('integrations.edit');
    }

    /**
     * Whether the tool is where the setting points to (null when there's nothing to check).
     */
    private function found(string $key, string $value): ?bool
    {
        return match ($key) {
            'docker_socket' => file_exists($value) && filetype($value) === 'socket',
            'caddy_binary' => is_file($value) && is_executable($value),
            'caddy_config' => is_file($value),
            default => null,
        };
    }
}
