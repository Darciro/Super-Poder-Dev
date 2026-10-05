import { Form, Link } from '@inertiajs/react';
import { useState } from 'react';
import type { ComponentProps } from 'react';
import InputError from '@/components/input-error';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type Category = {
    id: number;
    name: string;
};

type Props = {
    /** Spread of a Wayfinder `.form()` (store or update). */
    action: Pick<ComponentProps<typeof Form>, 'action' | 'method'>;
    categories: Category[];
    defaults: { title: string; category_id: number | null; body: string };
    submitLabel: string;
    cancelHref: string;
};

/**
 * Title, category and Markdown body of a document, with a Write / Preview switch.
 */
export function DocumentForm({
    action,
    categories,
    defaults,
    submitLabel,
    cancelHref,
}: Props) {
    const [body, setBody] = useState(defaults.body);
    const [tab, setTab] = useState<'write' | 'preview'>('write');

    return (
        <Form {...action} className="flex flex-col gap-6">
            {({ processing, errors }) => (
                <>
                    <div className="grid gap-2">
                        <Label htmlFor="title">Title</Label>
                        <Input
                            id="title"
                            name="title"
                            defaultValue={defaults.title}
                            required
                            autoFocus
                            placeholder="Page title"
                            className="h-12 text-xl font-semibold md:text-xl"
                        />
                        <InputError message={errors.title} />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="category_id">Category</Label>
                        <Select
                            name="category_id"
                            defaultValue={
                                defaults.category_id
                                    ? String(defaults.category_id)
                                    : undefined
                            }
                        >
                            <SelectTrigger
                                id="category_id"
                                className="w-full sm:w-72"
                            >
                                <SelectValue placeholder="Choose a category" />
                            </SelectTrigger>
                            <SelectContent>
                                {categories.map((category) => (
                                    <SelectItem
                                        key={category.id}
                                        value={String(category.id)}
                                    >
                                        {category.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <InputError message={errors.category_id} />
                    </div>

                    <div className="grid gap-2">
                        <div className="flex items-end justify-between">
                            <Label htmlFor="body">Content</Label>
                            <div
                                role="tablist"
                                className="inline-flex rounded-md border p-0.5 text-sm"
                            >
                                {(['write', 'preview'] as const).map(
                                    (value) => (
                                        <button
                                            key={value}
                                            type="button"
                                            role="tab"
                                            aria-selected={tab === value}
                                            onClick={() => setTab(value)}
                                            className={cn(
                                                'rounded px-3 py-1 text-muted-foreground capitalize',
                                                tab === value &&
                                                    'bg-muted font-medium text-foreground',
                                            )}
                                        >
                                            {value}
                                        </button>
                                    ),
                                )}
                            </div>
                        </div>
                        {/* Kept mounted in preview so the form still submits the body. */}
                        <Textarea
                            id="body"
                            name="body"
                            value={body}
                            onChange={(event) => setBody(event.target.value)}
                            placeholder={
                                '# Heading\n\nWrite in **Markdown**: lists, `code`, tables, [links](https://example.com)…'
                            }
                            className={cn(
                                'min-h-96 font-mono',
                                tab === 'preview' && 'hidden',
                            )}
                        />
                        {tab === 'preview' && (
                            <div className="min-h-96 rounded-md border p-4">
                                {body.trim() === '' ? (
                                    <p className="text-sm text-muted-foreground">
                                        Nothing to preview.
                                    </p>
                                ) : (
                                    <Markdown>{body}</Markdown>
                                )}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Markdown supported: headings, lists, tables, task
                            lists, code blocks and links.
                        </p>
                        <InputError message={errors.body} />
                    </div>

                    <div className="flex items-center gap-2">
                        <Button disabled={processing}>{submitLabel}</Button>
                        <Button variant="outline" asChild>
                            <Link href={cancelHref}>Cancel</Link>
                        </Button>
                    </div>
                </>
            )}
        </Form>
    );
}
