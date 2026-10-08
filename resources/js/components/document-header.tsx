import { FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { DocumentSummary } from '@/pages/documentation/index';
import { formatDate } from '@/pages/documentation/index';

/**
 * Document title, category and authorship, kept on screen below the app header
 * while the page scrolls, with the page's actions on the right.
 */
export function DocumentHeader({
    document,
    badge,
    actions,
    className,
}: {
    document: DocumentSummary;
    /** Extra marker next to the category, e.g. "Editing". */
    badge?: ReactNode;
    actions: ReactNode;
    /** Width of the content, to line up with the page below (max-w-4xl by default). */
    className?: string;
}) {
    const updated = document.updated_at !== document.created_at;

    return (
        <header className="sticky top-16 z-5 border-b bg-background/90 backdrop-blur group-has-data-[collapsible=icon]/sidebar-wrapper:top-12">
            <div
                className={cn(
                    'mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6',
                    className,
                )}
            >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileText className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <h1 className="truncate text-base font-semibold tracking-tight">
                            {document.title}
                        </h1>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {document.category}
                        </span>
                        {badge}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                        Created by{' '}
                        <span className="text-foreground">
                            {document.author ?? 'a deleted user'}
                        </span>{' '}
                        on {formatDate(document.created_at)}
                        {updated && (
                            <>
                                {' '}
                                · Updated {formatDate(document.updated_at)}
                                {document.editor && (
                                    <>
                                        {' '}
                                        by{' '}
                                        <span className="text-foreground">
                                            {document.editor}
                                        </span>
                                    </>
                                )}
                            </>
                        )}
                    </p>
                </div>
                <div className="ml-auto flex items-center gap-2">{actions}</div>
            </div>
        </header>
    );
}
