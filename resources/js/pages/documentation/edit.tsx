import { Head, setLayoutProps } from '@inertiajs/react';
import { useEffect } from 'react';
import DocumentController from '@/actions/App/Http/Controllers/DocumentController';
import { DocumentForm } from '@/components/document-form';
import type { Category } from '@/components/document-form';
import { edit, index, show } from '@/routes/documentation';

export default function EditDocument({
    document,
    categories,
}: {
    document: {
        id: number;
        title: string;
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
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
                <h1 className="text-xl font-semibold tracking-tight">
                    Edit document
                </h1>
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
