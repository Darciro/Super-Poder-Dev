<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;

/**
 * Environment for programs started on the user's behalf (IDE, local shells), as if
 * they were started from the user's own terminal.
 *
 *  - Only the user's variables: this app's own (APP_KEY, DB_*, NATIVEPHP_*, …) would
 *    override the .env of the projects opened with them.
 *  - The PATH of the user's login shell: the desktop app, opened from the Dock or
 *    Finder, only gets the system's (/usr/bin:/bin:/usr/sbin:/sbin), without Homebrew,
 *    `code`, `cursor`, etc.
 */
class ShellEnvironment
{
    /**
     * Variables passed on from this process.
     */
    private const VARIABLES = ['HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'SSH_AUTH_SOCK'];

    /**
     * Where programs are usually installed, used when the login shell can't tell.
     */
    private const COMMON_PATHS = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin'];

    /**
     * Reading the login shell's PATH takes a moment (it loads the user's shell config).
     */
    private const CACHE_SECONDS = 3600;

    /**
     * Marks the PATH in the shell's output, which may also contain greetings, etc.
     */
    private const MARKER = '__SHELL_ENVIRONMENT_PATH__';

    /**
     * @return array<string, string>
     */
    public function variables(): array
    {
        return collect(self::VARIABLES)
            ->mapWithKeys(fn (string $name) => [$name => getenv($name)])
            ->filter(fn (string|false $value) => is_string($value) && $value !== '')
            ->put('PATH', $this->path())
            ->all();
    }

    /**
     * For Process::env(): the user's variables, and every other inherited one removed
     * (a process otherwise inherits all of this one's).
     *
     * @return array<string, string|false>
     */
    public function replacing(): array
    {
        return [...array_fill_keys(array_keys(getenv()), false), ...$this->variables()];
    }

    public function path(): string
    {
        $current = explode(':', (string) getenv('PATH'));

        $login = Cache::remember('shell-environment.path', self::CACHE_SECONDS, fn () => $this->loginShellPath() ?? '');

        $directories = $login !== '' ? [...explode(':', $login), ...$current] : [...$current, ...self::COMMON_PATHS];

        return collect($directories)->filter()->unique()->implode(':');
    }

    /**
     * PATH as set up by the user's shell config, interactive files included (~/.zshrc,
     * where tools like nvm add theirs).
     */
    private function loginShellPath(): ?string
    {
        $shell = getenv('SHELL') ?: '/bin/zsh';

        $result = Process::timeout(10)
            ->input('')
            ->env(['HOME' => getenv('HOME') ?: '/'])
            ->run([$shell, '-ilc', 'printf "%s%s%s" '.self::MARKER.' "$PATH" '.self::MARKER]);

        if ($result->failed() || ! preg_match('/'.self::MARKER.'(.+?)'.self::MARKER.'/s', $result->output(), $matches)) {
            return null;
        }

        return trim($matches[1]);
    }
}
