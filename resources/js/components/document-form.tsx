import { Form, Link } from '@inertiajs/react';
import type { FormComponentRef } from '@inertiajs/core';
import { useEffect, useRef, useState } from 'react';
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
import { Spinner } from '@/components/ui/spinner';
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

const TABS = ['write', 'preview'] as const;

/**
 * Title, category and Markdown body of a document, with a Write / Preview switch
 * and the Save / Cancel bar kept at the bottom of the screen.
 */
export function DocumentForm({
    action,
    categories,
    defaults,
    submitLabel,
    cancelHref,
}: Props) {
    const form = useRef<FormComponentRef>(null);
    const [body, setBody] = useState(defaults.body);
    const [tab, setTab] = useState<(typeof TABS)[number]>('write');

    // ⌘S / Ctrl+S saves.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 's') {
                event.preventDefault();
                form.current?.submit();
            }
        };

        window.addEventListener('keydown', onKeyDown);

        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    return (
        <Form ref={form} {...action} className="flex flex-col gap-4">
            {({ processing, errors, isDirty }) => (
                <>
                    <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="grid gap-2">
                            <Label
                                htmlFor="title"
                                className="text-[13px] text-muted-foreground"
                            >
                                Title
                            </Label>
                            <Input
                                id="title"
                                name="title"
                                defaultValue={defaults.title}
                                required
                                autoFocus
                                placeholder="Page title"
                                className="h-11 text-lg font-semibold md:text-lg"
                            />
                            <InputError message={errors.title} />
                        </div>

                        <div className="grid content-start gap-2">
                            <Label
                                htmlFor="category_id"
                                className="text-[13px] text-muted-foreground"
                            >
                                Category
                            </Label>
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
                                    className="h-11 w-full sm:w-60"
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
                    </section>

                    <section className="overflow-hidden rounded-xl border bg-card">
                        <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
                            <Label
                                htmlFor="body"
                                className="text-[13px] text-muted-foreground"
                            >
                                Content
                            </Label>
                            <div
                                role="tablist"
                                aria-label="Editor mode"
                                className="flex h-8 items-center rounded-lg border bg-background p-0.5"
                            >
                                {TABS.map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === value}
                                        onClick={() => setTab(value)}
                                        className={cn(
                                            'flex h-full items-center rounded-md px-3 text-xs font-medium capitalize transition',
                                            tab === value
                                                ? 'bg-muted text-foreground'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                        </header>
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
                                'min-h-[60vh] rounded-none border-0 bg-transparent p-4 font-mono shadow-none focus-visible:ring-0 dark:bg-transparent',
                                tab === 'preview' && 'hidden',
                            )}
                        />
                        {tab === 'preview' && (
                            <div className="min-h-[60vh] p-6 sm:p-8">
                                {body.trim() === '' ? (
                                    <p className="text-sm text-muted-foreground">
                                        Nothing to preview.
                                    </p>
                                ) : (
                                    <Markdown>{body}</Markdown>
                                )}
                            </div>
                        )}
                    </section>
                    <InputError message={errors.body} />

                    <footer className="sticky bottom-4 z-5 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
                        <p className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
                            {isDirty ? (
                                <>
                                    <span className="size-2 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400" />
                                    <span className="text-foreground">
                                        Unsaved changes
                                    </span>
                                </>
                            ) : (
                                <span className="truncate">
                                    Markdown supported: headings, lists, tables,
                                    task lists, code blocks and links.
                                </span>
                            )}
                        </p>
                        <div className="ml-auto flex items-center gap-2">
                            <Button variant="outline" asChild>
                                <Link href={cancelHref}>Cancel</Link>
                            </Button>
                            <Button disabled={processing}>
                                {processing && <Spinner />}
                                {submitLabel}
                                <kbd className="ml-1 rounded border border-primary-foreground/30 px-1 text-[10px] font-normal opacity-70">
                                    ⌘S
                                </kbd>
                            </Button>
                        </div>
                    </footer>
                </>
            )}
        </Form>
    );
}
