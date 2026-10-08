import { Head, Link, setLayoutProps } from '@inertiajs/react';
import { FileText, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { DocumentHeader } from '@/components/document-header';
import { Markdown } from '@/components/markdown';
import { TableOfContents, useHeadings } from '@/components/table-of-contents';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DocumentSummary } from '@/pages/documentation/index';
import {
    deleteMethod as deletePage,
    edit,
    index,
    show,
} from '@/routes/documentation';

export default function ShowDocument({
    document,
}: {
    document: DocumentSummary & { body: string | null };
}) {
    useEffect(() => {
        setLayoutProps({
            breadcrumbs: [
                { title: 'Documentation', href: index() },
                { title: document.title, href: show(document.id) },
            ],
        });
    }, [document.id, document.title]);

    const article = useRef<HTMLElement>(null);
    const headings = useHeadings(article, document.body);
    // Wider page to fit the table of contents next to the text.
    const width = headings.length > 0 ? 'max-w-6xl' : 'max-w-4xl';

    return (
        <>
            <Head title={document.title} />
            <DocumentHeader
                document={document}
                className={width}
                actions={
                    <>
                        <Button variant="outline" size="sm" asChild>
                            <Link href={edit(document.id)}>
                                <Pencil />
                                Edit
                            </Link>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
                        >
                            <Link href={deletePage(document.id)}>
                                <Trash2 />
                                Delete
                            </Link>
                        </Button>
                    </>
                }
            />
            <div
                className={cn(
                    'mx-auto grid w-full gap-6 p-4 sm:p-6',
                    width,
                    headings.length > 0 && 'lg:grid-cols-[minmax(0,1fr)_15rem]',
                )}
            >
                {document.body?.trim() ? (
                    <article
                        ref={article}
                        className="min-w-0 rounded-xl border bg-card p-6 sm:p-8"
                    >
                        {/* Headings stop below the app header and the sticky document header. */}
                        <Markdown className="prose-headings:scroll-mt-40">
                            {document.body}
                        </Markdown>
                    </article>
                ) : (
                    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                        <FileText className="size-8" />
                        <p>This page is empty.</p>
                        <Button variant="outline" size="sm" asChild>
                            <Link href={edit(document.id)}>
                                <Pencil />
                                Start writing
                            </Link>
                        </Button>
                    </div>
                )}
                {headings.length > 0 && (
                    <aside className="hidden lg:block">
                        <TableOfContents
                            headings={headings}
                            className="sticky top-38 group-has-data-[collapsible=icon]/sidebar-wrapper:top-34"
                        />
                    </aside>
                )}
            </div>
        </>
    );
}
