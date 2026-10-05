import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * Render Markdown (GitHub flavored: tables, task lists, strikethrough).
 * Raw HTML in the source is not rendered.
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
                className,
            )}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
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
