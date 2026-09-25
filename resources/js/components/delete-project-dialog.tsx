import { Form } from '@inertiajs/react';
import ProjectController from '@/actions/App/Http/Controllers/ProjectController';
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

type Props = {
    project: string;
    name: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/**
 * Confirm removing a project from the dashboard.
 */
export function DeleteProjectDialog({
    project,
    name,
    open,
    onOpenChange,
}: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete {name ?? project}?</DialogTitle>
                    <DialogDescription>
                        The project and its details are removed from the
                        dashboard, and its terminal session is ended. Nothing is
                        deleted from your disk.
                    </DialogDescription>
                </DialogHeader>

                <Form
                    {...ProjectController.destroy.form(project)}
                    options={{ preserveScroll: true }}
                    onSuccess={() => onOpenChange(false)}
                >
                    {({ processing }) => (
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="outline">
                                    Cancel
                                </Button>
                            </DialogClose>
                            <Button variant="destructive" disabled={processing}>
                                Delete project
                            </Button>
                        </DialogFooter>
                    )}
                </Form>
            </DialogContent>
        </Dialog>
    );
}
