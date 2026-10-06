import { Form, Head } from '@inertiajs/react';
import { Download, Upload } from 'lucide-react';
import DataController from '@/actions/App/Http/Controllers/Settings/DataController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { edit, exportMethod } from '@/routes/data';

type Counts = {
    projects: number;
    categories: number;
    documents: number;
    settings: number;
};

function plural(count: number, singular: string, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`;
}

export default function Data({ counts }: { counts: Counts }) {
    return (
        <>
            <Head title="Data" />

            <h1 className="sr-only">Data</h1>

            <div className="space-y-12">
                <div className="space-y-6">
                    <Heading
                        variant="small"
                        title="Export"
                        description="Save your projects, documentation and integrations to a file, as a backup or to move them to another install"
                    />

                    <p className="text-sm text-muted-foreground">
                        {plural(counts.projects, 'project')},{' '}
                        {plural(counts.categories, 'category', 'categories')},{' '}
                        {plural(counts.documents, 'document')} and{' '}
                        {plural(counts.settings, 'integration setting')}.
                    </p>

                    <Button asChild>
                        {/* A plain link: the browser (or the desktop app) saves the file. */}
                        <a href={exportMethod().url} download>
                            <Download />
                            Export data
                        </a>
                    </Button>
                </div>

                <div className="space-y-6">
                    <Heading
                        variant="small"
                        title="Import"
                        description="Add the data of an exported file to this install"
                    />

                    <p className="text-sm text-muted-foreground">
                        Nothing is deleted: projects, categories, documents and
                        settings that already exist are updated with the
                        file&apos;s, the others are added.
                    </p>

                    <Form
                        {...DataController.import.form()}
                        options={{ preserveScroll: true }}
                        resetOnSuccess
                        className="space-y-6"
                    >
                        {({ processing, errors }) => (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="file">Exported file</Label>
                                    <Input
                                        id="file"
                                        name="file"
                                        type="file"
                                        accept="application/json,.json"
                                        required
                                    />
                                    <InputError message={errors.file} />
                                </div>

                                <Button
                                    variant="secondary"
                                    disabled={processing}
                                    data-test="import-data-button"
                                >
                                    <Upload />
                                    Import data
                                </Button>
                            </>
                        )}
                    </Form>
                </div>
            </div>
        </>
    );
}

Data.layout = {
    breadcrumbs: [
        {
            title: 'Data',
            href: edit(),
        },
    ],
};
