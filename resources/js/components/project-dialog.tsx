import { Form } from '@inertiajs/react';
import { useState } from 'react';
import ProjectController from '@/actions/App/Http/Controllers/ProjectController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type ProjectDetails = {
    name: string | null;
    path: string | null;
    repository: string | null;
    information: string | null;
};

type Props = {
    /** Project to edit; omitted to add a new local project. */
    project?: string;
    details?: ProjectDetails | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

function slugify(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^[-_]+|-+$/g, '');
}

/**
 * Add a local project, or edit the details of a project (Docker or local).
 */
export function ProjectDialog({ project, details, open, onOpenChange }: Props) {
    const editing = project !== undefined;

    // New projects: the identifier follows the name until it's edited by hand.
    const [slug, setSlug] = useState('');
    const [slugEdited, setSlugEdited] = useState(false);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>
                        {editing ? `Project · ${project}` : 'Add local project'}
                    </DialogTitle>
                    <DialogDescription>
                        {editing
                            ? 'Details of this project on your machine.'
                            : "A project that doesn't run in Docker. It shows up in the list with the others."}
                    </DialogDescription>
                </DialogHeader>

                <Form
                    {...(editing
                        ? ProjectController.update.form(project)
                        : ProjectController.store.form())}
                    options={{ preserveScroll: true }}
                    onSuccess={() => onOpenChange(false)}
                    className="space-y-5"
                >
                    {({ processing, errors }) => (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    defaultValue={details?.name ?? ''}
                                    placeholder="My project"
                                    autoComplete="off"
                                    autoFocus
                                    onChange={(event) => {
                                        if (!editing && !slugEdited) {
                                            setSlug(
                                                slugify(event.target.value),
                                            );
                                        }
                                    }}
                                />
                                <InputError message={errors.name} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="project">Project</Label>
                                {editing ? (
                                    // The identifier links the project to its Docker containers and sessions.
                                    <Input
                                        id="project"
                                        value={project}
                                        disabled
                                        className="font-mono"
                                    />
                                ) : (
                                    <Input
                                        id="project"
                                        name="project"
                                        value={slug}
                                        onChange={(event) => {
                                            setSlug(event.target.value);
                                            setSlugEdited(true);
                                        }}
                                        placeholder="my-project"
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="font-mono"
                                        required
                                    />
                                )}
                                <InputError message={errors.project} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="path">Path</Label>
                                <Input
                                    id="path"
                                    name="path"
                                    defaultValue={details?.path ?? ''}
                                    placeholder={`/Users/you/Projects/${project ?? (slug || 'my-project')}`}
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="font-mono"
                                />
                                <InputError message={errors.path} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="repository">Repository</Label>
                                <Input
                                    id="repository"
                                    name="repository"
                                    defaultValue={details?.repository ?? ''}
                                    placeholder="git@github.com:org/repo.git"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="font-mono"
                                />
                                <InputError message={errors.repository} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="information">Information</Label>
                                <Textarea
                                    id="information"
                                    name="information"
                                    defaultValue={details?.information ?? ''}
                                    placeholder="Notes, credentials location, how to run it…"
                                    rows={4}
                                    className="max-h-60"
                                />
                                <InputError message={errors.information} />
                            </div>

                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button type="button" variant="outline">
                                        Cancel
                                    </Button>
                                </DialogClose>
                                <Button disabled={processing}>
                                    {editing ? 'Save' : 'Add project'}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </Form>
            </DialogContent>
        </Dialog>
    );
}
