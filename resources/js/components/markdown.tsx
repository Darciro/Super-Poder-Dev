import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

type HastNode = {
    type: string;
    tagName?: string;
    value?: string;
    properties?: Record<string, unknown>;
    children?: HastNode[];
};

function textOf(node: HastNode): string {
    return node.type === 'text'
        ? (node.value ?? '')
        : (node.children ?? []).map(textOf).join('');
}

function slugify(text: string): string {
    return (
        text
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-') || 'section'
    );
}

/**
 * Rehype plugin: give each heading an id from its text, numbering repeats
 * ("setup", "setup-1") like GitHub.
 */
function headingIds() {
    return (tree: HastNode) => {
        const used = new Map<string, number>();

        const visit = (node: HastNode) => {
            if (
                node.type === 'element' &&
                /^h[1-6]$/.test(node.tagName ?? '')
            ) {
                const slug = slugify(textOf(node));
                const count = used.get(slug) ?? 0;

                used.set(slug, count + 1);
                node.properties = {
                    ...node.properties,
                    id: count === 0 ? slug : `${slug}-${count}`,
                };
            }

            node.children?.forEach(visit);
        };

        visit(tree);
    };
}

/**
 * Render Markdown (GitHub flavored: tables, task lists, strikethrough).
 * Raw HTML in the source is not rendered. Headings get an id from their text,
 * so they can be linked to (`#id`) and listed in a table of contents.
 */
export function Markdown({
    children,
    className,
}: {
    children: string;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'prose max-w-none prose-neutral dark:prose-invert prose-headings:scroll-mt-20 prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-pre:bg-muted prose-pre:text-foreground',
                // Long words and URLs break instead of widening the page; code blocks
                // and tables scroll sideways inside their own box.
                'min-w-0 wrap-anywhere prose-pre:max-w-full prose-pre:overflow-x-auto prose-pre:wrap-normal prose-table:my-0 prose-table:wrap-break-word prose-img:max-w-full',
                className,
            )}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[headingIds]}
                components={{
                    table: ({ node: _node, ...props }) => (
                        <div className="my-6 max-w-full overflow-x-auto">
                            <table {...props} />
                        </div>
                    ),
                    a: ({ href, children, ...props }) => {
                        const external = href?.startsWith('http');

                        return (
                            <a
                                href={href}
                                {...props}
                                {...(external && {
                                    target: '_blank',
                                    rel: 'noreferrer',
                                })}
                            >
                                {children}
                            </a>
                        );
                    },
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
