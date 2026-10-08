import { ListTree } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { cn } from '@/lib/utils';

export type TocHeading = {
    id: string;
    text: string;
    level: number;
};

// A heading becomes the current section once it scrolls above this line
// (below the app header and the sticky document header).
const ACTIVE_OFFSET = 160;

/**
 * The h1–h3 headings rendered inside the container, read again whenever `content` changes.
 */
export function useHeadings(
    container: RefObject<HTMLElement | null>,
    content: unknown,
): TocHeading[] {
    const [headings, setHeadings] = useState<TocHeading[]>([]);

    useEffect(() => {
        const elements =
            container.current?.querySelectorAll<HTMLElement>('h1, h2, h3') ??
            [];

        setHeadings(
            [...elements]
                .filter((element) => element.id)
                .map((element) => ({
                    id: element.id,
                    text: element.textContent ?? '',
                    level: Number(element.tagName[1]),
                })),
        );
    }, [container, content]);

    return headings;
}

function useActiveHeading(headings: TocHeading[]): string | null {
    const [active, setActive] = useState<string | null>(null);

    useEffect(() => {
        const update = () => {
            const atBottom =
                window.innerHeight + window.scrollY >=
                document.documentElement.scrollHeight - 2;

            if (atBottom) {
                setActive(headings.at(-1)?.id ?? null);

                return;
            }

            let current: string | null = headings[0]?.id ?? null;

            for (const { id } of headings) {
                const top = document
                    .getElementById(id)
                    ?.getBoundingClientRect().top;

                if (top !== undefined && top <= ACTIVE_OFFSET) {
                    current = id;
                }
            }

            setActive(current);
        };

        update();
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);

        return () => {
            window.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
        };
    }, [headings]);

    return active;
}

/**
 * "On this page" navigation: links to the document's headings, with the section
 * being read highlighted.
 */
export function TableOfContents({
    headings,
    className,
}: {
    headings: TocHeading[];
    className?: string;
}) {
    const active = useActiveHeading(headings);

    // The headings only get rendered after the page loads, so the browser can't
    // jump to a #heading in the URL by itself.
    useEffect(() => {
        const id = decodeURIComponent(window.location.hash.slice(1));

        if (id && headings.some((heading) => heading.id === id)) {
            document.getElementById(id)?.scrollIntoView({ block: 'start' });
        }
    }, [headings]);
    const minLevel = Math.min(...headings.map(({ level }) => level));

    const go = (id: string) => {
        document
            .getElementById(id)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(history.state, '', `#${id}`);
    };

    return (
        <nav aria-label="Table of contents" className={className}>
            <p className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <ListTree className="size-3.5" />
                On this page
            </p>
            <ul className="max-h-[calc(100svh-12rem)] space-y-0.5 overflow-y-auto border-l text-sm">
                {headings.map(({ id, text, level }) => (
                    <li key={id}>
                        <a
                            href={`#${id}`}
                            onClick={(event) => {
                                event.preventDefault();
                                go(id);
                            }}
                            aria-current={
                                active === id ? 'location' : undefined
                            }
                            style={{
                                paddingLeft: `${0.75 + (level - minLevel) * 0.75}rem`,
                            }}
                            className={cn(
                                '-ml-px block truncate border-l py-1 pr-2 transition',
                                active === id
                                    ? 'border-foreground font-medium text-foreground'
                                    : 'border-transparent text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground',
                            )}
                            title={text}
                        >
                            {text}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
