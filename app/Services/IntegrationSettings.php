<?php

namespace App\Services;

use App\Models\Setting;

/**
 * Where the dashboard finds the tools it works with: Docker, Caddy and the IDE.
 *
 * Set on the settings page and stored in the database, since the desktop app ships its
 * .env inside the app bundle. A setting left empty uses the default from
 * config/services.php (and so the .env, when there's one to edit).
 */
class IntegrationSettings
{
    /**
     * Settings and the config they default to.
     */
    public const DEFAULTS = [
        'docker_socket' => 'services.docker.socket',
        'caddy_binary' => 'services.caddy.binary',
        'caddy_config' => 'services.caddy.config',
        'caddy_admin' => 'services.caddy.admin',
        'ide_command' => 'services.ide.command',
    ];

    /**
     * @var array<string, string>|null
     */
    private ?array $stored = null;

    public function get(string $key): string
    {
        return $this->stored()[$key] ?? $this->default($key);
    }

    public function default(string $key): string
    {
        return (string) config(self::DEFAULTS[$key]);
    }

    /**
     * Values set on the settings page (unset ones use their default).
     *
     * @return array<string, string>
     */
    public function stored(): array
    {
        return $this->stored ??= Setting::whereIn('key', array_keys(self::DEFAULTS))->pluck('value', 'key')->all();
    }

    /**
     * Save the given settings: an empty one goes back to its default.
     *
     * @param  array<string, string|null>  $values
     */
    public function save(array $values): void
    {
        foreach (array_intersect_key($values, self::DEFAULTS) as $key => $value) {
            $value = trim((string) $value);

            $value === ''
                ? Setting::whereKey($key)->delete()
                : Setting::updateOrCreate(['key' => $key], ['value' => $value]);
        }

        $this->stored = null;
    }
}
