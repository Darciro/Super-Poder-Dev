import { Form, Head, Link, setLayoutProps } from '@inertiajs/react';
import { TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import DocumentController from '@/actions/App/Http/Controllers/DocumentController';
import { Button } from '@/components/ui/button';
import {
    deleteMethod as deletePage,
    index,
    show,
} from '@/routes/documentation';

export default function DeleteDocument({
    document,
}: {
    document: { id: number; title: string; category: string };
}) {
    useEffect(() => {
        setLayoutProps({
            breadcrumbs: [
                { title: 'Documentation', href: index() },
                { title: document.title, href: show(document.id) },
                { title: 'Delete', href: deletePage(document.id) },
            ],
        });
    }, [document.id, document.title]);

    return (
        <>
            <Head title={`Delete · ${document.title}`} />
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 md:p-8">
                <div className="flex flex-col gap-4 rounded-xl border border-destructive/40 bg-destructive/5 p-6">
                    <div className="flex items-center gap-2 text-destructive">
                        <TriangleAlert className="size-5" />
                        <h1 className="text-lg font-semibold">
                            Delete this document?
                        </h1>
                    </div>
                    <p className="text-sm">
                        <span className="font-medium">{document.title}</span>{' '}
                        <span className="text-muted-foreground">
                            ({document.category})
                        </span>{' '}
                        will be permanently deleted. This can't be undone.
                    </p>
                    <Form
                        {...DocumentController.destroy.form(document.id)}
                        className="flex gap-2"
                    >
                        {({ processing }) => (
                            <>
                                <Button
                                    variant="destructive"
                                    disabled={processing}
                                >
                                    Delete document
                                </Button>
                                <Button variant="outline" asChild>
                                    <Link href={show(document.id)}>Cancel</Link>
                                </Button>
                            </>
                        )}
                    </Form>
                </div>
            </div>
        </>
    );
}
