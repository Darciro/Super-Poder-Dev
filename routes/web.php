<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\NativeController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\TerminalController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

// Outside the auth group: links on the login screens open in the browser too.
Route::post('native/open-external', [NativeController::class, 'openExternal'])->name('native.open-external');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');
    Route::post('dashboard/containers/{container}/{action}', [DashboardController::class, 'containerAction'])
        ->where(['container' => '[a-zA-Z0-9][a-zA-Z0-9_.-]*', 'action' => 'start|stop|restart'])
        ->name('dashboard.containers.action');
    Route::post('dashboard/caddy/{action}', [DashboardController::class, 'caddyAction'])
        ->whereIn('action', ['start', 'stop'])
        ->name('dashboard.caddy.action');

    Route::post('dashboard/projects', [ProjectController::class, 'store'])->name('dashboard.projects.store');
    Route::put('dashboard/projects/{project}', [ProjectController::class, 'update'])
        ->where('project', ProjectController::PROJECT_PATTERN)
        ->name('dashboard.projects.update');
    Route::delete('dashboard/projects/{project}', [ProjectController::class, 'destroy'])
        ->where('project', ProjectController::PROJECT_PATTERN)
        ->name('dashboard.projects.destroy');
    Route::post('dashboard/projects/{project}/open-ide', [ProjectController::class, 'openInIde'])
        ->where('project', ProjectController::PROJECT_PATTERN)
        ->name('dashboard.projects.open-ide');

    Route::resource('documentation', DocumentController::class)
        ->parameters(['documentation' => 'document']);
    Route::get('documentation/{document}/delete', [DocumentController::class, 'delete'])
        ->name('documentation.delete');

    $terminalRoutes = function () {
        Route::post('/', 'store')->name('store');
        Route::get('output', 'output')->name('output');
        Route::post('input', 'input')->name('input');
        Route::post('resize', 'resize')->name('resize');
        Route::delete('/', 'destroy')->name('destroy');
    };

    // Constrained ids and names: they're used in file paths and shell arguments.
    Route::prefix('dashboard/containers/{container}/terminal')
        ->whereAlphaNumeric('container')
        ->controller(TerminalController::class)
        ->name('dashboard.containers.terminal.')
        ->group($terminalRoutes);

    Route::prefix('dashboard/projects/{project}/terminal')
        ->where(['project' => ProjectController::PROJECT_PATTERN])
        ->controller(TerminalController::class)
        ->name('dashboard.projects.terminal.')
        ->group($terminalRoutes);
});

require __DIR__.'/settings.php';
