import { Head, Link, setLayoutProps } from '@inertiajs/react';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DocumentSummary } from '@/pages/documentation/index';
import { formatDate } from '@/pages/documentation/index';
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

    return (
        <>
            <Head title={document.title} />
            <article className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
                <header className="flex flex-col gap-3 border-b pb-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <Badge variant="secondary">{document.category}</Badge>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" asChild>
                                <Link href={edit(document.id)}>
                                    <Pencil />
                                    Edit
                                </Link>
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                                <Link
                                    href={deletePage(document.id)}
                                    className="text-destructive"
                                >
                                    <Trash2 />
                                    Delete
                                </Link>
                            </Button>
                        </div>
                    </div>
                    <h1 className="text-3xl font-semibold tracking-tight">
                        {document.title}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Created by {document.author ?? 'a deleted user'} on{' '}
                        {formatDate(document.created_at)}
                        {document.updated_at !== document.created_at && (
                            <>
                                {' '}
                                · Last updated {formatDate(document.updated_at)}
                                {document.editor && <> by {document.editor}</>}
                            </>
                        )}
                    </p>
                </header>

                {document.body?.trim() ? (
                    <Markdown>{document.body}</Markdown>
                ) : (
                    <p className="text-muted-foreground">
                        This page is empty.{' '}
                        <Link
                            href={edit(document.id)}
                            className="text-foreground underline underline-offset-4"
                        >
                            Start writing
                        </Link>
                        .
                    </p>
                )}
            </article>
        </>
    );
}
