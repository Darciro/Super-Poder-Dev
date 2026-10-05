<?php

use App\Models\Category;
use App\Models\Document;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

test('guests are redirected to the login page', function () {
    auth()->logout();

    $this->get(route('documentation.index'))->assertRedirect(route('login'));
});

test('the uncategorized category exists by default', function () {
    expect(Category::pluck('name')->all())->toBe([Category::DEFAULT]);
});

test('the documentation page lists the documents', function () {
    $document = Document::factory()->create(['created_by' => $this->user->id]);

    $this->get(route('documentation.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('documentation/index')
            ->has('documents', 1)
            ->where('documents.0.title', $document->title)
            ->where('documents.0.category', $document->category->name)
            ->where('documents.0.author', $this->user->name));
});

test('the create page defaults to uncategorized', function () {
    $this->get(route('documentation.create'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('documentation/create')
            ->where('defaultCategory', Category::firstWhere('name', Category::DEFAULT)->id)
            ->has('categories', 1));
});

test('a document can be created', function () {
    $category = Category::firstWhere('name', Category::DEFAULT);

    $response = $this->post(route('documentation.store'), [
        'title' => 'Local setup',
        'category_id' => $category->id,
        'body' => "# Local setup\n\n- Run `composer setup`",
    ]);

    $document = Document::firstWhere('title', 'Local setup');

    $response->assertRedirect(route('documentation.show', $document))->assertSessionHasNoErrors();

    expect($document)
        ->category_id->toBe($category->id)
        ->body->toBe("# Local setup\n\n- Run `composer setup`")
        ->created_by->toBe($this->user->id)
        ->updated_by->toBe($this->user->id);
});

test('a document needs a title and an existing category', function (array $data, string $error) {
    $this->post(route('documentation.store'), [
        'title' => 'Title',
        'category_id' => Category::first()->id,
        ...$data,
    ])->assertSessionHasErrors($error);

    expect(Document::count())->toBe(0);
})->with([
    'missing title' => [['title' => ''], 'title'],
    'missing category' => [['category_id' => ''], 'category_id'],
    'unknown category' => [['category_id' => 999], 'category_id'],
]);

test('a document can be viewed', function () {
    $document = Document::factory()->create(['body' => '**Bold**']);

    $this->get(route('documentation.show', $document))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('documentation/show')
            ->where('document.title', $document->title)
            ->where('document.body', '**Bold**'));
});

test('a document can be edited', function () {
    $author = User::factory()->create();
    $document = Document::factory()->create(['created_by' => $author->id, 'updated_by' => $author->id]);

    $this->get(route('documentation.edit', $document))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('documentation/edit'));

    $this->put(route('documentation.update', $document), [
        'title' => 'Renamed',
        'category_id' => $document->category_id,
        'body' => 'New body',
    ])->assertRedirect(route('documentation.show', $document));

    expect($document->fresh())
        ->title->toBe('Renamed')
        ->body->toBe('New body')
        ->created_by->toBe($author->id)
        ->updated_by->toBe($this->user->id);
});

test('a document can be deleted after confirming', function () {
    $document = Document::factory()->create();

    $this->get(route('documentation.delete', $document))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('documentation/delete')
            ->where('document.title', $document->title));

    $this->delete(route('documentation.destroy', $document))
        ->assertRedirect(route('documentation.index'));

    expect(Document::count())->toBe(0);
});
