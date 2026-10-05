import { Head } from '@inertiajs/react';
import DocumentController from '@/actions/App/Http/Controllers/DocumentController';
import { DocumentForm } from '@/components/document-form';
import type { Category } from '@/components/document-form';
import { create, index } from '@/routes/documentation';

export default function CreateDocument({
    categories,
    defaultCategory,
}: {
    categories: Category[];
    defaultCategory: number | null;
}) {
    return (
        <>
            <Head title="New document" />
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
                <h1 className="text-xl font-semibold tracking-tight">
                    New document
                </h1>
                <DocumentForm
                    action={DocumentController.store.form()}
                    categories={categories}
                    defaults={{
                        title: '',
                        category_id: defaultCategory,
                        body: '',
                    }}
                    submitLabel="Publish"
                    cancelHref={index().url}
                />
            </div>
        </>
    );
}

CreateDocument.layout = {
    breadcrumbs: [
        { title: 'Documentation', href: index() },
        { title: 'New document', href: create() },
    ],
};
