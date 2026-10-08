import { usePage } from '@inertiajs/react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { formatBytes } from '@/lib/utils';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types';

type Host = {
    version: string;
    os: string;
    cpus: number;
    memory: number;
    images: number;
};

/**
 * Docker host summary, shown on the pages that share a `host` prop (the dashboard).
 */
function HostStatus() {
    const { host } = usePage<{ host?: Host | null }>().props;

    if (!host) {
        return null;
    }

    return (
        <span className="ml-auto hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="size-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
            {host.os} {host.version} · {host.cpus} CPUs ·{' '}
            {formatBytes(host.memory)} · {host.images} images
        </span>
    );
}

export function AppSidebarHeader({
    breadcrumbs = [],
}: {
    breadcrumbs?: BreadcrumbItemType[];
}) {
    return (
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border/50 bg-background/80 px-6 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-4">
            <div className="flex items-center gap-2">
                <SidebarTrigger className="-ml-1" />
                <Breadcrumbs breadcrumbs={breadcrumbs} />
            </div>
            <HostStatus />
        </header>
    );
}
