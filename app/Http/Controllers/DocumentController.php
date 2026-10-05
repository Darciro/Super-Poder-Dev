<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Document;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class DocumentController extends Controller
{
    /**
     * The list of documents.
     */
    public function index(): Response
    {
        $documents = Document::query()
            ->with(['category:id,name', 'author:id,name', 'editor:id,name'])
            ->latest('updated_at')
            ->get(['id', 'title', 'category_id', 'created_by', 'updated_by', 'created_at', 'updated_at']);

        return Inertia::render('documentation/index', [
            'documents' => $documents->map(fn (Document $document) => $this->summary($document)),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('documentation/create', [
            'categories' => $this->categories(),
            'defaultCategory' => Category::where('name', Category::DEFAULT)->value('id'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $document = Document::create([
            ...$request->validate($this->rules()),
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Document created.']);

        return to_route('documentation.show', $document);
    }

    /**
     * The document, with its Markdown body rendered.
     */
    public function show(Document $document): Response
    {
        $document->load(['category:id,name', 'author:id,name', 'editor:id,name']);

        return Inertia::render('documentation/show', [
            'document' => [...$this->summary($document), 'body' => $document->body],
        ]);
    }

    public function edit(Document $document): Response
    {
        return Inertia::render('documentation/edit', [
            'document' => $document->only(['id', 'title', 'category_id', 'body']),
            'categories' => $this->categories(),
        ]);
    }

    public function update(Request $request, Document $document): RedirectResponse
    {
        $document->update([
            ...$request->validate($this->rules()),
            'updated_by' => $request->user()->id,
        ]);

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Document saved.']);

        return to_route('documentation.show', $document);
    }

    /**
     * Confirm deleting the document.
     */
    public function delete(Document $document): Response
    {
        $document->load('category:id,name');

        return Inertia::render('documentation/delete', [
            'document' => $document->only(['id', 'title']) + ['category' => $document->category->name],
        ]);
    }

    public function destroy(Document $document): RedirectResponse
    {
        $document->delete();

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Document deleted.']);

        return to_route('documentation.index');
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    private function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'category_id' => ['required', 'integer', Rule::exists(Category::class, 'id')],
            'body' => ['nullable', 'string', 'max:500000'],
        ];
    }

    /**
     * @return array<int, array{id: int, name: string}>
     */
    private function categories(): array
    {
        return Category::orderBy('name')->get(['id', 'name'])->toArray();
    }

    /**
     * @return array<string, mixed>
     */
    private function summary(Document $document): array
    {
        return [
            'id' => $document->id,
            'title' => $document->title,
            'category' => $document->category->name,
            'author' => $document->author?->name,
            'editor' => $document->editor?->name,
            'created_at' => $document->created_at?->toIso8601String(),
            'updated_at' => $document->updated_at?->toIso8601String(),
        ];
    }
}
