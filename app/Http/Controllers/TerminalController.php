<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Services\TerminalSessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Endpoints used by the dashboard terminals (xterm.js) to talk to their session.
 *
 * Serves two kinds of terminal, depending on the route:
 *  - dashboard/containers/{container}/terminal: a shell inside the container
 *  - dashboard/projects/{project}/terminal: a shell on this machine, in the project's folder
 */
class TerminalController extends Controller
{
    public function __construct(private TerminalSessions $sessions) {}

    /**
     * Start the session, or keep using the one already running.
     */
    public function store(Request $request): Response
    {
        ['cols' => $cols, 'rows' => $rows] = $this->validateSize($request);

        $this->sessions->start($this->key($request), $this->target($request), $cols, $rows);

        return response()->noContent();
    }

    public function output(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'session' => ['nullable', 'string'],
            'offset' => ['nullable', 'integer', 'min:0'],
        ]);

        $output = $this->sessions->output($this->key($request), $validated['session'] ?? null, (int) ($validated['offset'] ?? 0));

        // Raw TTY bytes may not be valid UTF-8 on their own (e.g. a character split between reads).
        return response()->json([...$output, 'data' => base64_encode($output['data'])]);
    }

    public function input(Request $request): Response
    {
        // Base64 encoded so whitespace-only keystrokes (Enter, space) survive TrimStrings.
        $validated = $request->validate(['data' => ['required', 'string', 'max:87384']]);
        $data = base64_decode($validated['data'], strict: true);

        abort_if($data === false || $data === '', 422, 'Invalid terminal input.');
        abort_unless($this->sessions->isRunning($this->key($request)), 409, 'The terminal session has ended.');

        $this->sessions->input($this->key($request), $data);

        return response()->noContent();
    }

    public function resize(Request $request): Response
    {
        ['cols' => $cols, 'rows' => $rows] = $this->validateSize($request);

        $this->sessions->resize($this->key($request), $cols, $rows);

        return response()->noContent();
    }

    public function destroy(Request $request): Response
    {
        $this->sessions->stop($this->key($request));

        return response()->noContent();
    }

    /**
     * Session key: the container id, or "project-{name}" for a project's local terminal.
     */
    private function key(Request $request): string
    {
        $container = $request->route('container');

        return is_string($container) ? $container : 'project-'.$request->route('project');
    }

    /**
     * @return array{type: 'container', container: string}|array{type: 'local', cwd: string}
     */
    private function target(Request $request): array
    {
        $container = $request->route('container');

        if (is_string($container)) {
            return ['type' => 'container', 'container' => $container];
        }

        // Without a saved location, open where a new terminal would: the home folder.
        $path = Project::where('project', $request->route('project'))->value('path');

        return ['type' => 'local', 'cwd' => $path ?? (getenv('HOME') ?: '/')];
    }

    /**
     * @return array{cols: int, rows: int}
     */
    private function validateSize(Request $request): array
    {
        return $request->validate([
            'cols' => ['required', 'integer', 'min:1', 'max:1000'],
            'rows' => ['required', 'integer', 'min:1', 'max:1000'],
        ]);
    }
}
