import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Compact ghost button with only an icon; the label goes to the tooltip and screen readers.
 * Spreads the rest of the props so it also works as a Radix `asChild` trigger.
 */
export function IconButton({
    label,
    className,
    ...props
}: ComponentProps<typeof Button> & { label: string }) {
    return (
        <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            title={label}
            className={cn(
                'size-7 text-muted-foreground hover:text-foreground [&_svg:not([class*=size-])]:size-3.5',
                className,
            )}
            {...props}
        />
    );
}
