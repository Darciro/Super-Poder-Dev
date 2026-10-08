<?php

use App\Models\User;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Native\Desktop\Facades\Shell;

test('links open in the default browser from the desktop app', function () {
    inDesktopApp();
    Shell::fake();

    $this->postJson(route('native.open-external'), ['url' => 'https://github.com/laravel/laravel'])
        ->assertNoContent();

    Shell::assertOpenedExternal('https://github.com/laravel/laravel');
});

test('only web links are opened', function (string $url) {
    inDesktopApp();
    $shell = Shell::fake();

    $this->postJson(route('native.open-external'), ['url' => $url])
        ->assertUnprocessable();

    expect($shell->openExternalCalls)->toBeEmpty();
})->with(['file' => 'file:///etc/passwd', 'script' => 'javascript:alert(1)', 'app' => 'vscode://file/etc']);

test('opening links is not available outside the desktop app', function () {
    $this->postJson(route('native.open-external'), ['url' => 'https://laravel.com'])
        ->assertNotFound();
});

test('the desktop app signs in its local user, created on first launch', function () {
    inDesktopApp();
    Process::fake(['*id*-F*' => "Jane Doe\n"]);

    $this->get(route('dashboard'))->assertOk();

    $user = User::sole();

    expect($user->name)->toBe('Jane Doe')
        ->and($user->email)->toBe(Str::slug(get_current_user()).'@localhost')
        ->and($user->hasVerifiedEmail())->toBeTrue();
    $this->assertAuthenticatedAs($user);
});

test('the desktop app signs in the existing user, verifying their email', function () {
    inDesktopApp();

    $user = User::factory()->unverified()->create();
    User::factory()->create();

    $this->get(route('dashboard'))->assertOk();

    $this->assertAuthenticatedAs($user);
    expect($user->fresh()->hasVerifiedEmail())->toBeTrue();
});

test('the login screens lead to the dashboard in the desktop app', function () {
    inDesktopApp();

    $this->get(route('login'))->assertRedirect(route('dashboard'));
});

test('browsers still have to log in', function () {
    User::factory()->create();

    $this->get(route('dashboard'))->assertRedirect(route('login'));
    $this->assertGuest();
});

test('pages know whether they run in the desktop app', function (bool $desktop) {
    inDesktopApp($desktop);

    $this->actingAs(User::factory()->create())
        ->get(route('dashboard'))
        ->assertInertia(fn (Assert $page) => $page->where('desktop', $desktop));
})->with(['desktop' => true, 'browser' => false]);

test('the desktop app only answers its own window', function () {
    inDesktopApp();

    // Signed in without a login: anything else reaching its port must not get in.
    $this->withHeader('X-NativePHP-Secret', 'wrong')->get(route('dashboard'))->assertForbidden();
    $this->withHeaders(['X-NativePHP-Secret' => ''])->get(route('dashboard'))->assertForbidden();
    $this->assertGuest();
});
