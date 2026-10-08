import { Head, Link, setLayoutProps } from '@inertiajs/react';
import { Eye, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import DocumentController from '@/actions/App/Http/Controllers/DocumentController';
import { DocumentForm } from '@/components/document-form';
import type { Category } from '@/components/document-form';
import { DocumentHeader } from '@/components/document-header';
import { Button } from '@/components/ui/button';
import type { DocumentSummary } from '@/pages/documentation/index';
import {
    deleteMethod as deletePage,
    edit,
    index,
    show,
} from '@/routes/documentation';

export default function EditDocument({
    document,
    categories,
}: {
    document: DocumentSummary & {
        category_id: number;
        body: string | null;
    };
    categories: Category[];
}) {
    useEffect(() => {
        setLayoutProps({
            breadcrumbs: [
                { title: 'Documentation', href: index() },
                { title: document.title, href: show(document.id) },
                { title: 'Edit', href: edit(document.id) },
            ],
        });
    }, [document.id, document.title]);

    return (
        <>
            <Head title={`Edit · ${document.title}`} />
            <DocumentHeader
                document={document}
                badge={
                    <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        Editing
                    </span>
                }
                actions={
                    <>
                        <Button variant="outline" size="sm" asChild>
                            <Link href={show(document.id)}>
                                <Eye />
                                View
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
            <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
                <DocumentForm
                    action={DocumentController.update.form(document.id)}
                    categories={categories}
                    defaults={{
                        title: document.title,
                        category_id: document.category_id,
                        body: document.body ?? '',
                    }}
                    submitLabel="Save"
                    cancelHref={show(document.id).url}
                />
            </div>
        </>
    );
}
