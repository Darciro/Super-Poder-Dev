<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Document;
use App\Models\Project;
use App\Models\Setting;
use App\Services\DataTransfer;
use App\Services\IntegrationSettings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Export the app's data to a file, and import such a file (see DataTransfer).
 */
class DataController extends Controller
{
    public function edit(): Response
    {
        return Inertia::render('settings/data', [
            'counts' => [
                'projects' => Project::count(),
                'categories' => Category::count(),
                'documents' => Document::count(),
                'settings' => Setting::whereIn('key', array_keys(IntegrationSettings::DEFAULTS))->count(),
            ],
        ]);
    }

    public function export(DataTransfer $transfer): StreamedResponse
    {
        $json = json_encode($transfer->export(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

        return response()->streamDownload(
            fn () => print ($json),
            'superpoder-dev-'.now()->format('Y-m-d-His').'.json',
            ['Content-Type' => 'application/json'],
        );
    }

    public function import(Request $request, DataTransfer $transfer): RedirectResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:20480'],
        ]);

        $data = json_decode((string) $request->file('file')->get(), true);

        if (! is_array($data)) {
            throw ValidationException::withMessages(['file' => 'This is not a JSON file.']);
        }

        try {
            $imported = $transfer->import($data, $request->user());
        } catch (ValidationException $e) {
            throw ValidationException::withMessages([
                'file' => 'This is not a SuperPoder Dev export, or it is damaged: '.collect($e->errors())->flatten()->first(),
            ]);
        }

        Inertia::flash('toast', ['type' => 'success', 'message' => sprintf(
            'Imported %d projects, %d categories, %d documents and %d settings.',
            $imported['projects'], $imported['categories'], $imported['documents'], $imported['settings'],
        )]);

        return to_route('data.edit');
    }
}
