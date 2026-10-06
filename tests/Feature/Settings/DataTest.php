<?php

use App\Models\Category;
use App\Models\Document;
use App\Models\Project;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

/**
 * @param  array<string, mixed>  $data
 */
function exportFile(array $data): UploadedFile
{
    return UploadedFile::fake()->createWithContent('export.json', json_encode($data));
}

/**
 * @return array<string, mixed>
 */
function exported(): array
{
    return json_decode(test()->get(route('data.export'))->streamedContent(), true);
}

test('guests cannot export or import data', function () {
    auth()->logout();

    $this->get(route('data.edit'))->assertRedirect(route('login'));
    $this->get(route('data.export'))->assertRedirect(route('login'));
    $this->post(route('data.import'))->assertRedirect(route('login'));
});

test('the data page counts what would be exported', function () {
    Project::factory()->count(2)->create();
    Document::factory()->create();

    $this->get(route('data.edit'))
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/data')
            ->where('counts.projects', 2)
            ->where('counts.documents', 1)
        );
});

test('data is exported to a json file, without users or ids', function () {
    Project::factory()->create(['project' => 'shop', 'name' => 'Shop', 'url_local' => 'http://shop.test']);
    $category = Category::create(['name' => 'Guides']);
    Document::factory()->create(['title' => 'Setup', 'category_id' => $category->id, 'body' => '# Setup']);
    Setting::create(['key' => 'ide_command', 'value' => 'cursor']);
    Setting::create(['key' => 'not-an-integration', 'value' => 'x']);

    $response = $this->get(route('data.export'))->assertOk()->assertDownload();
    $data = json_decode($response->streamedContent(), true);

    expect($data)->toMatchArray(['format' => 'superpoder-dev', 'version' => 1])
        ->and($data['projects'][0])->toMatchArray(['project' => 'shop', 'name' => 'Shop', 'url_local' => 'http://shop.test'])->not->toHaveKey('id')
        ->and($data['categories'])->toContain('Guides')
        ->and($data['documents'][0])->toMatchArray(['title' => 'Setup', 'category' => 'Guides', 'body' => '# Setup'])->not->toHaveKeys(['id', 'created_by'])
        ->and($data['settings'])->toBe(['ide_command' => 'cursor'])
        ->and(json_encode($data))->not->toContain($this->user->email);
});

test('exported data is imported into another install', function () {
    Project::factory()->create(['project' => 'shop', 'path' => '/Users/me/shop']);
    $category = Category::create(['name' => 'Guides']);
    $document = Document::factory()->create(['title' => 'Setup', 'category_id' => $category->id, 'body' => 'Run it']);
    $document->forceFill(['created_at' => '2026-01-02 03:04:05'])->save();
    Setting::create(['key' => 'docker_socket', 'value' => '/var/run/docker.sock']);

    $file = exportFile(exported());

    // Another install: empty.
    Document::query()->delete();
    Category::query()->delete();
    Project::query()->delete();
    Setting::query()->delete();

    $this->post(route('data.import'), ['file' => $file])->assertRedirect(route('data.edit'));

    $imported = Document::sole();

    expect(Project::sole())->project->toBe('shop')->path->toBe('/Users/me/shop')
        ->and($imported)->title->toBe('Setup')->body->toBe('Run it')->created_by->toBe($this->user->id)
        ->and($imported->category->name)->toBe('Guides')
        ->and($imported->created_at->toDateTimeString())->toBe('2026-01-02 03:04:05')
        ->and(Setting::find('docker_socket')->value)->toBe('/var/run/docker.sock');
});

test('an import is merged into the existing data', function () {
    Project::factory()->create(['project' => 'shop', 'name' => 'Old name']);
    Project::factory()->create(['project' => 'blog']);
    $category = Category::create(['name' => 'Guides']);
    Document::factory()->create(['title' => 'Setup', 'category_id' => $category->id, 'body' => 'Old']);
    Document::factory()->create(['title' => 'Other', 'category_id' => $category->id]);

    $this->post(route('data.import'), ['file' => exportFile([
        'format' => 'superpoder-dev',
        'version' => 1,
        'projects' => [['project' => 'shop', 'name' => 'New name'], ['project' => 'api']],
        'categories' => ['Guides'],
        'documents' => [
            ['title' => 'Setup', 'category' => 'Guides', 'body' => 'New'],
            ['title' => 'Deploy', 'category' => 'Runbooks', 'body' => 'Ship it'],
        ],
        'settings' => [],
    ])])->assertSessionHasNoErrors();

    expect(Project::orderBy('project')->pluck('name', 'project')->all())->toMatchArray(['shop' => 'New name'])
        ->and(Project::pluck('project')->all())->toContain('api', 'blog', 'shop')
        ->and(Document::where('title', 'Setup')->sole()->body)->toBe('New')
        ->and(Document::pluck('title')->all())->toContain('Other', 'Deploy')
        ->and(Category::pluck('name')->all())->toContain('Guides', 'Runbooks');
});

test('files that are not exports are rejected, changing nothing', function (string $contents) {
    Project::factory()->create(['project' => 'shop', 'name' => 'Shop']);

    $this->post(route('data.import'), [
        'file' => UploadedFile::fake()->createWithContent('export.json', $contents),
    ])->assertSessionHasErrors('file');

    expect(Project::sole()->name)->toBe('Shop');
})->with([
    'not json' => 'hello',
    'another app' => json_encode(['format' => 'other', 'version' => 1]),
    'newer version' => json_encode(['format' => 'superpoder-dev', 'version' => 2, 'projects' => [], 'categories' => [], 'documents' => [], 'settings' => []]),
    'invalid project' => json_encode(['format' => 'superpoder-dev', 'version' => 1, 'projects' => [['project' => 'shop', 'name' => 'Changed'], ['project' => '../etc']], 'categories' => [], 'documents' => [], 'settings' => []]),
    'unknown setting' => json_encode(['format' => 'superpoder-dev', 'version' => 1, 'projects' => [], 'categories' => [], 'documents' => [], 'settings' => ['APP_KEY' => 'x']]),
]);
