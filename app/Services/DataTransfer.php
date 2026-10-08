<?php

namespace App\Services;

use App\Http\Controllers\ProjectController;
use App\Models\Category;
use App\Models\Document;
use App\Models\Project;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * Exports the app's data to a file and imports it back: to keep a backup, or to move
 * it between installs (e.g. from the browser version into the desktop app, which has
 * its own database).
 *
 * Imports are merged into the existing data and never delete anything: projects are
 * matched by their Compose name, categories by name, documents by category and title,
 * settings by key. Users aren't included.
 */
class DataTransfer
{
    public const FORMAT = 'superpoder-dev';

    public const VERSION = 1;

    private const PROJECT_FIELDS = ['name', 'project', 'path', 'repository', 'information', 'url_local', 'url_dev', 'url_qa', 'url_staging', 'url_production'];

    /**
     * @return array{format: string, version: int, exported_at: string, projects: array<int, array<string, mixed>>, categories: array<int, string>, documents: array<int, array<string, mixed>>, settings: array<string, string>}
     */
    public function export(): array
    {
        return [
            'format' => self::FORMAT,
            'version' => self::VERSION,
            'exported_at' => now()->toIso8601String(),
            'projects' => Project::orderBy('project')->get(self::PROJECT_FIELDS)->toArray(),
            'categories' => Category::orderBy('name')->pluck('name')->all(),
            'documents' => Document::with('category')->orderBy('id')->get()
                ->map(fn (Document $document) => [
                    'title' => $document->title,
                    'category' => $document->category->name,
                    'body' => $document->body,
                    'created_at' => $document->created_at?->toIso8601String(),
                    'updated_at' => $document->updated_at?->toIso8601String(),
                ])
                ->all(),
            'settings' => Setting::orderBy('key')
                ->whereIn('key', array_keys(IntegrationSettings::DEFAULTS))
                ->pluck('value', 'key')
                ->all(),
        ];
    }

    /**
     * Rules for the contents of an exported file.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $url = ['nullable', 'string', 'max:2048'];

        return [
            'format' => ['required', 'in:'.self::FORMAT],
            'version' => ['required', 'integer', 'in:'.self::VERSION],
            'projects' => ['present', 'array'],
            'projects.*.project' => ['required', 'string', 'max:255', 'regex:/^'.ProjectController::PROJECT_PATTERN.'$/'],
            'projects.*.name' => ['nullable', 'string', 'max:255'],
            'projects.*.path' => ['nullable', 'string', 'max:1024'],
            'projects.*.repository' => ['nullable', 'string', 'max:1024'],
            'projects.*.information' => ['nullable', 'string'],
            'projects.*.url_local' => $url,
            'projects.*.url_dev' => $url,
            'projects.*.url_qa' => $url,
            'projects.*.url_staging' => $url,
            'projects.*.url_production' => $url,
            'categories' => ['present', 'array'],
            'categories.*' => ['required', 'string', 'max:255'],
            'documents' => ['present', 'array'],
            'documents.*.title' => ['required', 'string', 'max:255'],
            'documents.*.category' => ['required', 'string', 'max:255'],
            'documents.*.body' => ['nullable', 'string'],
            'documents.*.created_at' => ['nullable', 'date'],
            'documents.*.updated_at' => ['nullable', 'date'],
            'settings' => ['present', 'array:'.implode(',', array_keys(IntegrationSettings::DEFAULTS))],
            'settings.*' => ['required', 'string', 'max:1024'],
        ];
    }

    /**
     * Merge exported data into this install's.
     *
     * @param  array<string, mixed>  $data
     * @return array{projects: int, categories: int, documents: int, settings: int}
     */
    public function import(array $data, User $user): array
    {
        $data = Validator::make($data, $this->rules())->validate();

        return DB::transaction(function () use ($data, $user) {
            foreach ($data['projects'] as $project) {
                Project::updateOrCreate(
                    ['project' => $project['project']],
                    array_intersect_key($project, array_flip(self::PROJECT_FIELDS)),
                );
            }

            $categories = collect([...$data['categories'], ...array_column($data['documents'], 'category')])
                ->unique()
                ->mapWithKeys(fn (string $name) => [$name => Category::firstOrCreate(['name' => $name])->id]);

            foreach ($data['documents'] as $document) {
                $existing = Document::where('category_id', $categories[$document['category']])
                    ->where('title', $document['title'])
                    ->first();

                $existing
                    ? $existing->update(['body' => $document['body'] ?? null, 'updated_by' => $user->id])
                    : $this->createDocument($document, $categories[$document['category']], $user);
            }

            foreach ($data['settings'] as $key => $value) {
                Setting::updateOrCreate(['key' => $key], ['value' => $value]);
            }

            return [
                'projects' => count($data['projects']),
                'categories' => $categories->count(),
                'documents' => count($data['documents']),
                'settings' => count($data['settings']),
            ];
        });
    }

    /**
     * @param  array<string, mixed>  $document
     */
    private function createDocument(array $document, int $categoryId, User $user): void
    {
        $created = Document::create([
            'title' => $document['title'],
            'category_id' => $categoryId,
            'body' => $document['body'] ?? null,
            'created_by' => $user->id,
            'updated_by' => $user->id,
        ]);

        // Keep when it was written, not when it was imported.
        $created->timestamps = false;
        $created->forceFill(array_filter([
            'created_at' => $document['created_at'] ?? null,
            'updated_at' => $document['updated_at'] ?? null,
        ]))->save();
    }
}
