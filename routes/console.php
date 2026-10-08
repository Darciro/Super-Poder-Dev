<?php

use App\Native\StatusMenu;
use App\Services\Caddy;
use Illuminate\Console\Command;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Run by `composer dev`: the app is served at https://super-poder-dev.test through Caddy.
Artisan::command('caddy:start', function (Caddy $caddy) {
    if ($caddy->running()) {
        $this->components->info('Caddy is already running.');

        return Command::SUCCESS;
    }

    if (! $caddy->start()) {
        $this->components->error('Could not start Caddy. See storage/logs/caddy.log.');

        return Command::FAILURE;
    }

    $this->components->info('Caddy started.');

    return Command::SUCCESS;
})->purpose('Start Caddy unless it is already running');

// The desktop app runs the scheduler every minute: keep its menu bar status current.
Schedule::call(fn () => app(StatusMenu::class)->refresh())
    ->name('status-menu:refresh')
    ->everyMinute()
    ->when(fn () => (bool) config('nativephp-internal.running'));
