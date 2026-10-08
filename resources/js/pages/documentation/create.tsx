import { Head } from '@inertiajs/react';
import { FilePlus } from 'lucide-react';
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
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
                <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <FilePlus className="size-4" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold tracking-tight">
                            New document
                        </h1>
                        <p className="text-xs text-muted-foreground">
                            Write it in Markdown; it's published when you save.
                        </p>
                    </div>
                </div>
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
