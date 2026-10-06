<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Services\IntegrationSettings;
use App\Services\ShellEnvironment;
use App\Services\TerminalSessions;
use Closure;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Process;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class ProjectController extends Controller
{
    /**
     * Same format as Docker Compose project names (also used in URLs and file paths).
     */
    public const PROJECT_PATTERN = '[a-z0-9][a-z0-9_-]*';

    /**
     * Environments with a URL in the project details (url_<environment> columns).
     */
    public const ENVIRONMENTS = ['local', 'dev', 'qa', 'staging', 'production'];

    /**
     * Add a local project (one that doesn't run in Docker).
     */
    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'project' => ['required', 'string', 'max:255', 'regex:/^'.self::PROJECT_PATTERN.'$/', Rule::unique(Project::class)],
            ...$this->rules(),
        ], [
            'project.regex' => 'Use only lowercase letters, numbers, dashes and underscores (e.g. my-project).',
            ...$this->messages(),
        ]);

        Project::create($this->normalize($validated));

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Project added.']);

        return back();
    }

    /**
     * Save the details of a project (created on first save for Docker Compose projects).
     */
    public function update(Request $request, string $project): RedirectResponse
    {
        $validated = $request->validate($this->rules(), $this->messages());

        Project::updateOrCreate(['project' => $project], $this->normalize($validated));

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Project saved.']);

        return back();
    }

    /**
     * Remove a project from the dashboard, ending its local terminal session if running.
     */
    public function destroy(TerminalSessions $terminals, string $project): RedirectResponse
    {
        Project::where('project', $project)->delete();

        $terminals->stop("project-{$project}");

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Project deleted.']);

        return back();
    }

    /**
     * Open the project's local path in the IDE (the IDE command in the settings, VS Code by default).
     */
    public function openInIde(ShellEnvironment $shell, IntegrationSettings $settings, string $project): RedirectResponse
    {
        $path = Project::where('project', $project)->value('path');

        if (! $path || ! is_dir($path)) {
            Inertia::flash('toast', ['type' => 'error', 'message' => 'This project has no local path on this machine.']);

            return back();
        }

        // As if run from the user's terminal: their PATH, and none of this app's variables.
        $result = Process::env($shell->replacing())->run($settings->get('ide_command').' '.escapeshellarg($path));

        Inertia::flash('toast', $result->successful()
            ? ['type' => 'success', 'message' => 'Opening in the IDE…']
            : ['type' => 'error', 'message' => 'Could not open the IDE: '.(trim($result->errorOutput()) ?: 'check the IDE command in Settings → Integrations.')]);

        return back();
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    private function rules(): array
    {
        return [
            'name' => ['nullable', 'string', 'max:255'],
            'path' => [
                'nullable',
                'string',
                'max:1024',
                'starts_with:/',
                function (string $attribute, string $value, Closure $fail) {
                    if (! is_dir($value)) {
                        $fail('This directory does not exist on this machine.');
                    }
                },
            ],
            'repository' => ['nullable', 'string', 'max:1024'],
            'information' => ['nullable', 'string', 'max:10000'],
            ...collect(self::ENVIRONMENTS)
                ->mapWithKeys(fn (string $environment) => ["url_{$environment}" => ['nullable', 'url:http,https', 'max:2048']])
                ->all(),
        ];
    }

    /**
     * @return array<string, string>
     */
    private function messages(): array
    {
        return [
            'path.starts_with' => 'The path must be absolute (start with /).',
            'url_*.url' => 'Enter a full URL, starting with http:// or https://.',
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function normalize(array $validated): array
    {
        if (isset($validated['path'])) {
            $validated['path'] = rtrim($validated['path'], '/') ?: '/';
        }

        return $validated;
    }
}
