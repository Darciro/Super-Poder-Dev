import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    FileText,
    MoreHorizontal,
    Pencil,
    Plus,
    Search,
    Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
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
    className,
    children,
}: {
    column: SortColumn;
    sort: Sort;
    onSort: (column: SortColumn) => void;
    className?: string;
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
        <th
            className={cn('p-3 font-medium', className)}
            aria-sort={
                direction === 'asc'
                    ? 'ascending'
                    : direction === 'desc'
                      ? 'descending'
                      : 'none'
            }
        >
            <button
                type="button"
                onClick={() => onSort(column)}
                className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground"
            >
                {children}
                <Icon
                    className={cn(
                        'size-3.5',
                        direction
                            ? 'text-foreground'
                            : 'text-muted-foreground/60',
                    )}
                />
            </button>
        </th>
    );
}

function DocumentActions({ document }: { document: DocumentSummary }) {
    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for ${document.title}`}
                >
                    <MoreHorizontal />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                    <Link href={edit(document.id)}>
                        <Pencil />
                        Edit
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" asChild>
                    <Link href={deletePage(document.id)}>
                        <Trash2 />
                        Delete
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default function Documentation({
    documents,
}: {
    documents: DocumentSummary[];
}) {
    const [search, setSearch] = useState('');
    const term = search.trim().toLowerCase();
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

    const rows = useMemo(
        () =>
            sortDocuments(documents, sort).filter(
                (document) => term === '' || documentMatches(document, term),
            ),
        [documents, sort, term],
    );

    return (
        <>
            <Head title="Documentation" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full max-w-sm">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search documents..."
                            aria-label="Search documents"
                            className="pl-9"
                        />
                    </div>
                    <Button asChild>
                        <Link href={create()}>
                            <Plus />
                            New document
                        </Link>
                    </Button>
                </div>
                <div className="relative min-h-[100vh] flex-1 overflow-x-auto rounded-xl border border-sidebar-border/70 md:min-h-min dark:border-sidebar-border">
                    {documents.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
                            <FileText className="size-8" />
                            <p>No documents yet.</p>
                            <Button variant="outline" asChild>
                                <Link href={create()}>
                                    <Plus />
                                    Create the first one
                                </Link>
                            </Button>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-sidebar-border/70 dark:border-sidebar-border">
                                <tr className="align-middle">
                                    <SortableHeader
                                        column="title"
                                        sort={sort}
                                        onSort={toggleSort}
                                    >
                                        Title
                                    </SortableHeader>
                                    <SortableHeader
                                        column="category"
                                        sort={sort}
                                        onSort={toggleSort}
                                    >
                                        Category
                                    </SortableHeader>
                                    <th className="p-3 font-medium">
                                        Created by
                                    </th>
                                    <SortableHeader
                                        column="updated_at"
                                        sort={sort}
                                        onSort={toggleSort}
                                    >
                                        Last updated
                                    </SortableHeader>
                                    <th className="p-3 text-right font-medium">
                                        <span className="sr-only">Actions</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={5}
                                            className="p-4 text-muted-foreground"
                                        >
                                            No documents match “{search}”.
                                        </td>
                                    </tr>
                                )}
                                {rows.map((document) => (
                                    <tr
                                        key={document.id}
                                        onClick={() =>
                                            router.visit(show(document.id))
                                        }
                                        className="cursor-pointer border-b border-sidebar-border/70 align-middle last:border-b-0 hover:bg-muted/50 dark:border-sidebar-border"
                                    >
                                        <td className="p-3 font-medium">
                                            <Link
                                                href={show(document.id)}
                                                className="inline-flex items-center gap-2 hover:underline"
                                                onClick={(event) =>
                                                    event.stopPropagation()
                                                }
                                            >
                                                <FileText className="size-4 shrink-0 text-muted-foreground" />
                                                {document.title}
                                            </Link>
                                        </td>
                                        <td className="p-3">
                                            <Badge variant="secondary">
                                                {document.category}
                                            </Badge>
                                        </td>
                                        <td className="p-3 text-muted-foreground">
                                            {document.author ?? '—'}
                                        </td>
                                        <td className="p-3 text-muted-foreground tabular-nums">
                                            {formatDate(document.updated_at)}
                                            {document.editor && (
                                                <span>
                                                    {' '}
                                                    by {document.editor}
                                                </span>
                                            )}
                                        </td>
                                        <td
                                            className="px-3 py-1 text-right"
                                            onClick={(event) =>
                                                event.stopPropagation()
                                            }
                                        >
                                            <DocumentActions
                                                document={document}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
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
