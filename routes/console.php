<?php

use App\Native\StatusMenu;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// The desktop app runs the scheduler every minute: keep its menu bar status current.
Schedule::call(fn () => app(StatusMenu::class)->refresh())
    ->name('status-menu:refresh')
    ->everyMinute()
    ->when(fn () => (bool) config('nativephp-internal.running'));
