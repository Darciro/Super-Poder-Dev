<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('the about page shows the app version', function () {
    config(['nativephp.version' => '1.2.3']);

    $this->actingAs(User::factory()->create())
        ->get(route('about.show'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/about')
            ->where('about.version', '1.2.3')
            ->where('about.php', PHP_VERSION));
});

test('guests are redirected to the login page', function () {
    $this->get(route('about.show'))->assertRedirect(route('login'));
});
