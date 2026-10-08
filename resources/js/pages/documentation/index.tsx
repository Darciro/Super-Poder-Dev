import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    FilePlus,
    FileText,
    Pencil,
    Search,
    Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IconButton } from '@/components/icon-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    create,
    deleteMethod as deletePage,
    edit,
    index,
    show,
} from '@/routes/documentation';

export type DocumentSummary = {
    id: number;
    title: string;
    category: string;
    author: string | null;
    editor: string | null;
    created_at: string;
    updated_at: string;
};

type SortColumn = 'title' | 'category' | 'updated_at';
type Sort = { column: SortColumn; direction: 'asc' | 'desc' } | null;

const SORT_STORAGE_KEY = 'documentation.sort';

const ALL_CATEGORIES = '';

const GRID =
    'grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-4';

// Fixed width so the column legend lines up with the row actions.
const ACTIONS_WIDTH = 'w-16';

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function sortDocuments(documents: DocumentSummary[], sort: Sort) {
    if (sort === null) {
        return documents;
    }

    const { column, direction } = sort;
    const sign = direction === 'asc' ? 1 : -1;

    return [...documents].sort(
        (a, b) =>
            sign *
            a[column].localeCompare(b[column], undefined, {
                sensitivity: 'base',
                numeric: true,
            }),
    );
}

function documentMatches(document: DocumentSummary, term: string): boolean {
    return [document.title, document.category, document.author, document.editor]
        .filter((value): value is string => value !== null)
        .some((value) => value.toLowerCase().includes(term));
}

function SortableHeader({
    column,
    sort,
    onSort,
    children,
}: {
    column: SortColumn;
    sort: Sort;
    onSort: (column: SortColumn) => void;
    children: ReactNode;
}) {
    const direction = sort?.column === column ? sort.direction : null;
    const Icon =
        direction === 'asc'
            ? ArrowUp
            : direction === 'desc'
              ? ArrowDown
              : ArrowUpDown;

    return (
        <span>
            <button
                type="button"
                onClick={() => onSort(column)}
                className="-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase hover:text-foreground"
            >
                {children}
                <Icon
                    className={cn(
                        'size-3',
                        direction
                            ? 'text-foreground'
                            : 'text-muted-foreground/60',
                    )}
                />
            </button>
        </span>
    );
}

function Toolbar({
    search,
    onSearch,
    categories,
    category,
    onCategory,
}: {
    search: string;
    onSearch: (value: string) => void;
    categories: { name: string; count: number }[];
    category: string;
    onCategory: (category: string) => void;
}) {
    const input = useRef<HTMLInputElement>(null);

    // ⌘K / Ctrl+K focuses the search.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
                event.preventDefault();
                input.current?.focus();
            }
        };

        window.addEventListener('keydown', onKeyDown);

        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    return (
        <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-55 flex-1 sm:max-w-sm">
                <span className="sr-only">Search documents</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                    ref={input}
                    type="search"
                    value={search}
                    onChange={(event) => onSearch(event.target.value)}
                    placeholder="Search titles, categories, authors…"
                    className="h-9 w-full rounded-lg border bg-card pr-12 pl-9 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                />
                <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border px-1.5 text-[10px] text-muted-foreground">
                    ⌘K
                </kbd>
            </label>

            {categories.length > 1 && (
                <div
                    role="tablist"
                    aria-label="Filter by category"
                    className="flex h-9 max-w-full items-center overflow-x-auto rounded-lg border bg-card p-0.5"
                >
                    {categories.map(({ name, count }) => (
                        <button
                            key={name || 'all'}
                            role="tab"
                            type="button"
                            aria-selected={category === name}
                            onClick={() => onCategory(name)}
                            className={cn(
                                'flex h-full shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition',
                                category === name
                                    ? 'bg-muted text-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {name || 'All'}
                            <span className="text-muted-foreground tabular-nums">
                                {count}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <Button asChild className="ml-auto">
                <Link href={create()}>
                    <FilePlus />
                    New document
                </Link>
            </Button>
        </div>
    );
}

function DocumentRow({ document }: { document: DocumentSummary }) {
    return (
        <div
            onClick={() => router.visit(show(document.id))}
            className={cn(
                GRID,
                'group cursor-pointer px-4 py-2.5 text-sm transition hover:bg-muted/40',
            )}
        >
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <FileText className="size-4" />
                </div>
                <Link
                    href={show(document.id)}
                    onClick={(event) => event.stopPropagation()}
                    className="truncate font-medium hover:underline"
                >
                    {document.title}
                </Link>
            </div>

            <span className="min-w-0">
                <span className="inline-block max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {document.category}
                </span>
            </span>

            <span className="truncate text-xs text-muted-foreground">
                {document.author ?? '—'}
            </span>

            <span className="truncate text-xs text-muted-foreground tabular-nums">
                <span className="text-foreground">
                    {formatDate(document.updated_at)}
                </span>
                {document.editor && ` · ${document.editor}`}
            </span>

            <div
                onClick={(event) => event.stopPropagation()}
                className={cn(
                    'flex items-center justify-end gap-0.5 opacity-60 transition group-focus-within:opacity-100 group-hover:opacity-100',
                    ACTIONS_WIDTH,
                )}
            >
                <IconButton label={`Edit ${document.title}`} asChild>
                    <Link href={edit(document.id)}>
                        <Pencil />
                    </Link>
                </IconButton>
                <IconButton
                    label={`Delete ${document.title}`}
                    asChild
                    className="hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
                >
                    <Link href={deletePage(document.id)}>
                        <Trash2 />
                    </Link>
                </IconButton>
            </div>
        </div>
    );
}

export default function Documentation({
    documents,
}: {
    documents: DocumentSummary[];
}) {
    const [search, setSearch] = useState('');
    const term = search.trim().toLowerCase();
    const [category, setCategory] = useState(ALL_CATEGORIES);
    // Server order (last updated first) until a column is picked.
    const [sort, setSort] = useState<Sort>(null);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(SORT_STORAGE_KEY);

            if (saved) {
                setSort(JSON.parse(saved));
            }
        } catch {
            // Storage unavailable or corrupt: keep the default order.
        }
    }, []);

    const toggleSort = (column: SortColumn) => {
        const next: Sort =
            sort?.column !== column
                ? { column, direction: 'asc' }
                : sort.direction === 'asc'
                  ? { column, direction: 'desc' }
                  : null;

        setSort(next);

        try {
            if (next) {
                localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
            } else {
                localStorage.removeItem(SORT_STORAGE_KEY);
            }
        } catch {
            // Ignore: see above.
        }
    };

    const categories = useMemo(() => {
        const counts = new Map<string, number>();

        for (const document of documents) {
            counts.set(
                document.category,
                (counts.get(document.category) ?? 0) + 1,
            );
        }

        return [
            { name: ALL_CATEGORIES, count: documents.length },
            ...[...counts]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, count]) => ({ name, count })),
        ];
    }, [documents]);

    const rows = useMemo(
        () =>
            sortDocuments(documents, sort).filter(
                (document) =>
                    (category === ALL_CATEGORIES ||
                        document.category === category) &&
                    (term === '' || documentMatches(document, term)),
            ),
        [documents, sort, term, category],
    );

    return (
        <>
            <Head title="Documentation" />
            <div className="mx-auto w-full max-w-350 space-y-6 p-4 sm:p-6">
                <Toolbar
                    search={search}
                    onSearch={setSearch}
                    categories={categories}
                    category={category}
                    onCategory={setCategory}
                />

                {documents.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                        <FileText className="size-8" />
                        <p>No documents yet.</p>
                        <Button variant="outline" size="sm" asChild>
                            <Link href={create()}>
                                <FilePlus />
                                Create the first one
                            </Link>
                        </Button>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                        {term
                            ? `No documents match “${search.trim()}”.`
                            : 'No documents in this category.'}
                    </div>
                ) : (
                    <section className="overflow-hidden rounded-xl border bg-card">
                        <div className="overflow-x-auto">
                            <div className="min-w-180">
                                <div
                                    className={cn(
                                        GRID,
                                        'border-b px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase',
                                    )}
                                >
                                    <span className="pl-11">
                                        <SortableHeader
                                            column="title"
                                            sort={sort}
                                            onSort={toggleSort}
                                        >
                                            Title
                                        </SortableHeader>
                                    </span>
                                    <SortableHeader
                                        column="category"
                                        sort={sort}
                                        onSort={toggleSort}
                                    >
                                        Category
                                    </SortableHeader>
                                    <span>Created by</span>
                                    <SortableHeader
                                        column="updated_at"
                                        sort={sort}
                                        onSort={toggleSort}
                                    >
                                        Last updated
                                    </SortableHeader>
                                    <span
                                        className={cn(
                                            ACTIONS_WIDTH,
                                            'text-right',
                                        )}
                                    >
                                        <span className="sr-only">Actions</span>
                                    </span>
                                </div>
                                <div className="divide-y">
                                    {rows.map((document) => (
                                        <DocumentRow
                                            key={document.id}
                                            document={document}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </>
    );
}

Documentation.layout = {
    breadcrumbs: [
        {
            title: 'Documentation',
            href: index(),
        },
    ],
};
