import { Deferred, Head, router, usePoll } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';
import {
    Box,
    ChevronDown,
    Code,
    Cpu,
    ExternalLink,
    FolderOpen,
    FolderPlus,
    Globe,
    MoreHorizontal,
    Network,
    Play,
    RefreshCw,
    RotateCw,
    Search,
    Square,
    SquareTerminal,
    Terminal,
    Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DeleteProjectDialog } from '@/components/delete-project-dialog';
import { IconButton } from '@/components/icon-button';
import { ENVIRONMENTS, ProjectDialog } from '@/components/project-dialog';
import type { ProjectDetails } from '@/components/project-dialog';
import { TerminalDialog } from '@/components/terminal-dialog';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { cn, formatBytes } from '@/lib/utils';
import { dashboard } from '@/routes';
import { action as caddyAction } from '@/routes/dashboard/caddy';
import { action as containerAction } from '@/routes/dashboard/containers';
import * as containerTerminal from '@/routes/dashboard/containers/terminal';
import { openIde } from '@/routes/dashboard/projects';
import * as projectTerminal from '@/routes/dashboard/projects/terminal';

type Port = {
    label: string;
    url: string | null;
};

type Container = {
    id: string;
    project: string | null;
    service: string | null;
    name: string;
    image: string;
    state: string;
    status: string;
    ports: Port[];
};

type ContainerGroup = {
    project: string | null;
    /** Saved details (Project dialog); null until saved. */
    details: ProjectDetails | null;
    containers: Container[];
};

type Host = {
    version: string;
    os: string;
    cpus: number;
    memory: number;
    images: number;
};

type LocalServer = {
    pid: number;
    address: string;
    url: string;
    path: string | null;
    name: string | null;
};

type CaddySite = {
    address: string;
    host: string;
    port: number;
    upstreams: string[];
};

type CaddyStatus = {
    running: boolean;
    config: string;
    exists: boolean;
    sites: CaddySite[];
};

type Stats = {
    cpu: number;
    memory: number;
    top: { name: string; cpu: number; memory: number }[];
};

type Tone = 'ok' | 'partial' | 'off';

type Filter = 'all' | 'running' | 'stopped';

const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'running', label: 'Running' },
    { id: 'stopped', label: 'Stopped' },
];

// Remembers the open terminal so it reopens after a page reload:
// a container id, or "project:{name}" for a project's local terminal.
const TERMINAL_STORAGE_KEY = 'dashboard.terminal';
const PROJECT_TERMINAL_PREFIX = 'project:';

const SESSION_NOTE =
    'The session keeps running when you close this window or reload the page.';

const COLLAPSED_STORAGE_KEY = 'dashboard.collapsed';

const STANDALONE_KEY = '__standalone';

const POLLED_PROPS = [
    'containers',
    'host',
    'stats',
    'terminals',
    'localServers',
    'caddy',
];

/* ───────────────────────── Helpers ───────────────────────── */

function isRunning(container: Container): boolean {
    return container.state === 'running';
}

function groupSummary(group: ContainerGroup): {
    running: number;
    total: number;
    tone: Tone;
} {
    const running = group.containers.filter(isRunning).length;
    const total = group.containers.length;

    return {
        running,
        total,
        tone: running === total ? 'ok' : running === 0 ? 'off' : 'partial',
    };
}

/**
 * Split Docker's status ("Up 2 days (healthy)", "Exited (137) 13 days ago")
 * into its health, exit code and the remaining text.
 */
function parseStatus(status: string): {
    text: string;
    health: 'healthy' | 'unhealthy' | null;
    exitCode: number | null;
} {
    const health = status.match(/\((healthy|unhealthy)\)/)?.[1] ?? null;
    const exited = status.match(/^Exited \((-?\d+)\)\s*(.*)$/);

    return {
        text: exited
            ? exited[2]
            : status.replace(/\s*\((healthy|unhealthy)\)/, ''),
        health: health as 'healthy' | 'unhealthy' | null,
        exitCode: exited ? parseInt(exited[1], 10) : null,
    };
}

function hostname(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

function containerMatches(container: Container, term: string): boolean {
    return [
        container.name,
        container.service,
        container.image,
        ...container.ports.map((port) => port.url ?? port.label),
    ]
        .filter((value): value is string => value !== null)
        .some((value) => value.toLowerCase().includes(term));
}

function projectMatches(group: ContainerGroup, term: string): boolean {
    return [
        group.project ?? 'standalone',
        group.details?.name,
        group.details?.path,
    ].some((value) => value?.toLowerCase().includes(term));
}

function openInIde(project: string) {
    router.post(openIde.url(project), {}, { preserveScroll: true });
}

/* ───────────────────────── Primitives ───────────────────────── */

function StatusDot({ tone }: { tone: Tone }) {
    return (
        <span className="relative inline-flex size-2 shrink-0">
            {tone === 'ok' && (
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
            )}
            <span
                className={cn(
                    'relative inline-flex size-2 rounded-full',
                    tone === 'ok' && 'bg-emerald-500 dark:bg-emerald-400',
                    tone === 'partial' && 'bg-amber-500 dark:bg-amber-400',
                    tone === 'off' && 'bg-muted-foreground/50',
                )}
            />
        </span>
    );
}

function Meter({
    value,
    max,
    tone = 'default',
}: {
    value: number;
    max: number;
    tone?: 'default' | 'ok';
}) {
    const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;

    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
                className={cn(
                    'h-full rounded-full transition-[width]',
                    tone === 'ok'
                        ? 'bg-emerald-500 dark:bg-emerald-400'
                        : 'bg-foreground/80',
                )}
                style={{ width: `${percent}%` }}
            />
        </div>
    );
}

function StatCard({
    icon: Icon,
    title,
    aside,
    children,
}: {
    icon: LucideIcon;
    title: string;
    aside?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="flex min-h-42 flex-col rounded-xl border bg-card p-4">
            <header className="mb-3 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                    <Icon className="size-4" />
                    {title}
                </h2>
                {aside}
            </header>
            <div className="flex flex-1 flex-col">{children}</div>
        </section>
    );
}

function BigNumber({ value, unit }: { value: number; unit: string }) {
    return (
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {value}
            <span className="ml-1 text-base font-normal text-muted-foreground">
                {unit}
            </span>
        </p>
    );
}

/* ───────────────────────── Overview cards ───────────────────────── */

function Resources({
    stats,
    host,
}: {
    stats?: Stats | null;
    host: Host | null;
}) {
    if (!stats) {
        return (
            <p className="text-sm text-muted-foreground">
                Usage is unavailable.
            </p>
        );
    }

    // `docker stats` counts 100% per core, so the host capacity is cpus × 100%.
    const cpuCapacity = (host?.cpus ?? 1) * 100;
    const [top] = stats.top;

    return (
        <>
            <div className="space-y-3">
                <div>
                    <div className="mb-1.5 flex justify-between text-xs">
                        <span>CPU</span>
                        <span className="text-muted-foreground tabular-nums">
                            <span className="text-foreground">
                                {stats.cpu.toFixed(1)}%
                            </span>
                            {host && ` of ${host.cpus} CPUs`}
                        </span>
                    </div>
                    <Meter value={stats.cpu} max={cpuCapacity} />
                </div>
                <div>
                    <div className="mb-1.5 flex justify-between text-xs">
                        <span>Memory</span>
                        <span className="text-muted-foreground tabular-nums">
                            <span className="text-foreground">
                                {formatBytes(stats.memory)}
                            </span>
                            {host && ` / ${formatBytes(host.memory)}`}
                        </span>
                    </div>
                    <Meter
                        value={stats.memory}
                        max={host?.memory ?? stats.memory}
                    />
                </div>
            </div>
            {top && (
                <p
                    className="mt-auto truncate pt-4 text-xs text-muted-foreground"
                    title={stats.top
                        .map(
                            (container) =>
                                `${container.name} ${formatBytes(container.memory)}`,
                        )
                        .join(' · ')}
                >
                    Top:{' '}
                    <span className="font-mono text-foreground/80">
                        {top.name}
                    </span>{' '}
                    {formatBytes(top.memory)}
                </p>
            )}
        </>
    );
}

function ResourcesFallback() {
    return (
        <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-4 w-2/3" />
        </div>
    );
}

function PortsCard({
    ports,
    webApps,
    localServers,
}: {
    ports: number;
    webApps: number;
    localServers: LocalServer[];
}) {
    return (
        <StatCard icon={Network} title="Ports">
            <BigNumber value={ports + localServers.length} unit="open" />
            <p className="mt-1 text-xs text-muted-foreground">
                <span className="text-foreground">{webApps}</span>{' '}
                {webApps === 1 ? 'web app' : 'web apps'} reachable in the
                browser
            </p>
            {localServers.length > 0 && (
                <div className="mt-auto pt-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
                        <Terminal className="size-3" /> From terminal
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {localServers.map((server) => (
                            <a
                                key={server.pid}
                                href={server.url}
                                target="_blank"
                                rel="noreferrer"
                                title={`php -S ${server.address}${server.path ? ` · ${server.path}` : ''} (PID ${server.pid})`}
                                className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted"
                            >
                                {server.name ?? server.address}{' '}
                                <span className="text-muted-foreground">
                                    :{server.address.split(':').pop()}
                                </span>
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </StatCard>
    );
}

function CaddyCard({ caddy }: { caddy: CaddyStatus }) {
    const [processing, setProcessing] = useState(false);
    const ports = [...new Set(caddy.sites.map((site) => site.port))].sort(
        (a, b) => a - b,
    );

    const run = (action: 'start' | 'stop') => {
        router.post(
            caddyAction({ action }),
            {},
            {
                preserveScroll: true,
                onStart: () => setProcessing(true),
                onFinish: () => setProcessing(false),
            },
        );
    };

    return (
        <StatCard
            icon={Globe}
            title="Caddy"
            aside={
                <span
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
                        caddy.running
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-muted text-muted-foreground',
                    )}
                >
                    <StatusDot tone={caddy.running ? 'ok' : 'off'} />
                    {caddy.running ? 'Running' : 'Stopped'}
                </span>
            }
        >
            {caddy.exists ? (
                <>
                    <div className="flex items-baseline justify-between gap-2">
                        <BigNumber
                            value={caddy.sites.length}
                            unit={caddy.sites.length === 1 ? 'host' : 'hosts'}
                        />
                        <span
                            className="truncate text-xs text-muted-foreground"
                            title={caddy.config}
                        >
                            {ports.length > 0
                                ? `${ports.length === 1 ? 'port' : 'ports'} ${ports.join(', ')}`
                                : 'no ports'}
                        </span>
                    </div>
                    <div className="mt-3 grid max-h-13 grid-cols-3 gap-1.5 overflow-y-auto">
                        {caddy.sites.map((site) => (
                            <a
                                key={site.address}
                                href={`${site.port === 80 ? 'http' : 'https'}://${site.host}${[80, 443].includes(site.port) ? '' : `:${site.port}`}`}
                                target="_blank"
                                rel="noreferrer"
                                title={`${site.address} → ${site.upstreams.join(', ') || 'no reverse_proxy'}`}
                                className="truncate rounded-md bg-muted px-1.5 py-0.5 text-center font-mono text-[11px] hover:bg-muted/70 hover:underline"
                            >
                                :{site.port}
                                <span className="text-muted-foreground">→</span>
                                {site.upstreams
                                    .map((upstream) =>
                                        upstream.split(':').pop(),
                                    )
                                    .join(', ') || '—'}
                            </a>
                        ))}
                    </div>
                </>
            ) : (
                <p className="text-sm text-muted-foreground">
                    Caddyfile not found at{' '}
                    <span className="font-mono">{caddy.config}</span>.
                </p>
            )}
            <div className="mt-auto flex gap-2 pt-3">
                {caddy.running ? (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={processing}
                        onClick={() => run('stop')}
                        className="h-7 px-2.5 text-xs hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
                    >
                        {processing ? <Spinner /> : <Square />}
                        Stop
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={processing || !caddy.exists}
                        onClick={() => run('start')}
                        className="h-7 px-2.5 text-xs"
                    >
                        {processing ? <Spinner /> : <Play />}
                        Start
                    </Button>
                )}
            </div>
        </StatCard>
    );
}

/* ───────────────────────── Toolbar ───────────────────────── */

function Toolbar({
    search,
    onSearch,
    filter,
    onFilter,
    counts,
    onAddProject,
}: {
    search: string;
    onSearch: (value: string) => void;
    filter: Filter;
    onFilter: (filter: Filter) => void;
    counts: Record<Filter, number>;
    onAddProject: () => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const [refreshing, setRefreshing] = useState(false);

    // ⌘K / Ctrl+K focuses the search.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
                event.preventDefault();
                input.current?.focus();
            }
        };

        window.addEventListener('keydown', onKeyDown);

        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const refresh = () => {
        router.reload({
            only: POLLED_PROPS,
            onStart: () => setRefreshing(true),
            onFinish: () => setRefreshing(false),
        });
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-55 flex-1 sm:max-w-sm">
                <span className="sr-only">Search containers</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                    ref={input}
                    type="search"
                    value={search}
                    onChange={(event) => onSearch(event.target.value)}
                    placeholder="Search projects, containers, images, ports…"
                    className="h-9 w-full rounded-lg border bg-card pr-12 pl-9 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                />
                <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border px-1.5 text-[10px] text-muted-foreground">
                    ⌘K
                </kbd>
            </label>

            <div
                role="tablist"
                aria-label="Filter by state"
                className="flex h-9 items-center rounded-lg border bg-card p-0.5"
            >
                {FILTERS.map(({ id, label }) => (
                    <button
                        key={id}
                        role="tab"
                        type="button"
                        aria-selected={filter === id}
                        onClick={() => onFilter(id)}
                        className={cn(
                            'flex h-full items-center gap-1.5 rounded-md px-3 text-xs font-medium transition',
                            filter === id
                                ? 'bg-muted text-foreground'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {label}
                        <span className="text-muted-foreground tabular-nums">
                            {counts[id]}
                        </span>
                    </button>
                ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
                <Button
                    variant="outline"
                    onClick={refresh}
                    disabled={refreshing}
                >
                    <RefreshCw className={cn(refreshing && 'animate-spin')} />
                    Refresh
                </Button>
                <Button onClick={onAddProject}>
                    <FolderPlus />
                    Add local project
                </Button>
            </div>
        </div>
    );
}

/* ───────────────────────── Project actions ───────────────────────── */

const ENVIRONMENT_STYLES: Record<(typeof ENVIRONMENTS)[number]['key'], string> =
    {
        url_local:
            'border-slate-500/30 bg-slate-500/10 text-slate-700 hover:bg-slate-500/20 dark:text-slate-300',
        url_dev:
            'border-sky-500/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300',
        url_qa: 'border-violet-500/30 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 dark:text-violet-300',
        url_staging:
            'border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300',
        url_production:
            'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300',
    };

/**
 * Project title that opens a panel of the configured environment tiles (each opens its URL in a new tab).
 */
function EnvironmentLinks({
    details,
    className,
    children,
}: {
    details: ProjectDetails | null;
    className?: string;
    children: ReactNode;
}) {
    const environments = ENVIRONMENTS.flatMap(({ key, label }) => {
        const url = details?.[key];

        return url ? [{ key, label, url }] : [];
    });

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger
                className={cn(
                    'inline-flex min-w-0 cursor-pointer items-center gap-1 rounded underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring',
                    className,
                )}
            >
                <span className="truncate">{children}</span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                className="w-80 rounded-xl p-3 shadow-lg"
            >
                <p className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Environments
                </p>
                {environments.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                        {environments.map(({ key, label, url }) => (
                            <DropdownMenuItem
                                key={key}
                                asChild
                                className={cn(
                                    'flex cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-3 py-2',
                                    ENVIRONMENT_STYLES[key],
                                )}
                            >
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <span className="flex w-full items-center justify-between text-sm font-semibold">
                                        {label}
                                        <ExternalLink className="size-3.5 opacity-70" />
                                    </span>
                                    <span className="w-full truncate font-mono text-[11px] opacity-80">
                                        {hostname(url)}
                                    </span>
                                </a>
                            </DropdownMenuItem>
                        ))}
                    </div>
                ) : (
                    <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm font-normal text-muted-foreground">
                        No environments configured. Add their URLs in More
                        actions → Project.
                    </p>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

type ProjectHandlers = {
    onEdit: () => void;
    onTerminal: () => void;
    onDelete: () => void;
};

function ProjectActions({
    group,
    onEdit,
    onTerminal,
    onDelete,
}: ProjectHandlers & { group: ContainerGroup }) {
    // Only projects without containers: for a Docker project, "delete" would read as
    // deleting its containers (its details can be cleared in the Project dialog).
    const deletable = group.details !== null && group.containers.length === 0;

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <IconButton label={`More actions for ${group.project}`}>
                    <MoreHorizontal className="size-4" />
                </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                    <FolderOpen />
                    Project
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onTerminal}>
                    <SquareTerminal />
                    Terminal
                </DropdownMenuItem>
                {group.details?.path && (
                    <DropdownMenuItem
                        onSelect={() => openInIde(group.project!)}
                    >
                        <Code />
                        Open in IDE
                    </DropdownMenuItem>
                )}
                {deletable && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            variant="destructive"
                            onSelect={onDelete}
                        >
                            <Trash2 />
                            Delete project
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/** Green when a terminal session is running, so it's easy to get back to. */
function TerminalButton({
    label,
    active,
    disabled,
    onClick,
}: {
    label: string;
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <IconButton
            label={active ? `${label} (session running)` : label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                active &&
                    'text-emerald-600 hover:text-emerald-500 dark:text-emerald-400',
            )}
        >
            <Terminal />
        </IconButton>
    );
}

/* ───────────────────────── Project + container rows ───────────────────────── */

const GRID =
    'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-4';

// Fixed width so the column legend lines up with the row actions.
const ACTIONS_WIDTH = 'w-23';

type ContainerActionName = 'start' | 'stop' | 'restart';

function ContainerStatus({ container }: { container: Container }) {
    const { text, health, exitCode } = parseStatus(container.status);

    return (
        <div className="flex min-w-0 items-center gap-2 text-xs">
            {isRunning(container) ? (
                <span className="truncate">{text}</span>
            ) : exitCode !== null ? (
                <span className="truncate text-muted-foreground">
                    Exited{' '}
                    <span
                        className={cn(
                            'font-mono',
                            exitCode !== 0 && 'text-red-600 dark:text-red-400',
                        )}
                    >
                        ({exitCode})
                    </span>
                    {text && ` · ${text}`}
                </span>
            ) : (
                <span className="truncate text-muted-foreground">
                    {container.status}
                </span>
            )}
            {health && (
                <span
                    className={cn(
                        'shrink-0 rounded px-1.5 py-px text-[10px] font-medium',
                        health === 'healthy'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-red-500/10 text-red-600 dark:text-red-400',
                    )}
                >
                    {health}
                </span>
            )}
        </div>
    );
}

function ContainerPorts({ ports }: { ports: Port[] }) {
    if (ports.length === 0) {
        return <span className="text-muted-foreground/60">—</span>;
    }

    return (
        <div className="flex min-w-0 flex-wrap gap-1.5">
            {ports.map((port) =>
                port.url ? (
                    <a
                        key={port.label}
                        href={port.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={port.label}
                        className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 font-mono text-[11px] text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                    >
                        {port.url
                            .replace(/^https?:\/\//, '')
                            .replace(/^localhost/, '')}
                        <ExternalLink className="size-3" />
                    </a>
                ) : (
                    <span
                        key={port.label}
                        className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                    >
                        {port.label}
                    </span>
                ),
            )}
        </div>
    );
}

function ContainerRow({
    container,
    terminalActive,
    onTerminal,
}: {
    container: Container;
    terminalActive: boolean;
    onTerminal: () => void;
}) {
    const [processing, setProcessing] = useState(false);
    const running = isRunning(container);
    const tone: Tone = running
        ? 'ok'
        : ['restarting', 'paused', 'created'].includes(container.state)
          ? 'partial'
          : 'off';

    const run = (action: ContainerActionName) => {
        router.post(
            containerAction({ container: container.id, action }),
            {},
            {
                preserveScroll: true,
                onStart: () => setProcessing(true),
                onFinish: () => setProcessing(false),
            },
        );
    };

    return (
        <div
            className={cn(
                GRID,
                'group px-4 py-2.5 text-sm transition hover:bg-muted/40',
            )}
        >
            <div className="flex min-w-0 items-center gap-3">
                <StatusDot tone={tone} />
                <div className="min-w-0">
                    <p
                        className={cn(
                            'truncate font-medium',
                            !running && 'text-muted-foreground',
                        )}
                    >
                        {container.service ?? container.name}
                    </p>
                    {container.service &&
                        container.service !== container.name && (
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                                {container.name}
                            </p>
                        )}
                </div>
            </div>

            <p
                className="truncate font-mono text-xs text-muted-foreground"
                title={container.image}
            >
                {container.image}
            </p>

            <ContainerStatus container={container} />

            <ContainerPorts ports={container.ports} />

            <div
                className={cn(
                    'flex items-center justify-end gap-0.5 transition group-focus-within:opacity-100 group-hover:opacity-100',
                    ACTIONS_WIDTH,
                    !processing && !terminalActive && 'opacity-60',
                )}
            >
                {processing ? (
                    <span className="inline-flex size-7 items-center justify-center text-muted-foreground">
                        <Spinner className="size-3.5" />
                    </span>
                ) : running ? (
                    <IconButton
                        label={`Stop ${container.name}`}
                        onClick={() => run('stop')}
                    >
                        <Square />
                    </IconButton>
                ) : (
                    <IconButton
                        label={`Start ${container.name}`}
                        onClick={() => run('start')}
                    >
                        <Play />
                    </IconButton>
                )}
                <IconButton
                    label={`Restart ${container.name}`}
                    disabled={processing}
                    onClick={() => run('restart')}
                >
                    <RotateCw />
                </IconButton>
                <TerminalButton
                    label={`Open shell in ${container.name}`}
                    active={terminalActive}
                    disabled={!running}
                    onClick={onTerminal}
                />
            </div>
        </div>
    );
}

function ProjectCard({
    group,
    expanded,
    onToggle,
    terminals,
    onContainerTerminal,
    ...handlers
}: ProjectHandlers & {
    group: ContainerGroup;
    expanded: boolean;
    onToggle: () => void;
    terminals: string[];
    onContainerTerminal: (id: string) => void;
}) {
    const { running, total, tone } = groupSummary(group);
    const name = group.details?.name ?? group.project ?? 'Standalone';

    return (
        <section className="overflow-hidden rounded-xl border bg-card">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
                    className="-ml-1 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <ChevronDown
                        className={cn(
                            'size-4 transition-transform',
                            !expanded && '-rotate-90',
                        )}
                    />
                </button>
                <StatusDot tone={tone} />
                {group.project ? (
                    <EnvironmentLinks
                        details={group.details}
                        className="font-semibold"
                    >
                        {name}
                    </EnvironmentLinks>
                ) : (
                    <span className="font-semibold">{name}</span>
                )}
                {group.details?.name && (
                    <span className="font-mono text-xs text-muted-foreground">
                        {group.project}
                    </span>
                )}
                <span
                    className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
                        tone === 'ok' &&
                            'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                        tone === 'partial' &&
                            'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                        tone === 'off' && 'bg-muted text-muted-foreground',
                    )}
                >
                    {running}/{total} running
                </span>

                {group.project && (
                    <div className="ml-auto flex items-center gap-1">
                        {group.details?.path && (
                            <button
                                type="button"
                                onClick={() => openInIde(group.project!)}
                                title="Open in IDE"
                                className="mr-1 hidden items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground lg:inline-flex"
                            >
                                <FolderOpen className="size-3.5" />
                                {group.details.path}
                            </button>
                        )}
                        <TerminalButton
                            label={`Open local terminal for ${group.project}`}
                            active={terminals.includes(
                                `project-${group.project}`,
                            )}
                            onClick={handlers.onTerminal}
                        />
                        <ProjectActions group={group} {...handlers} />
                    </div>
                )}
            </header>

            {expanded && (
                <div className="overflow-x-auto border-t">
                    <div className="min-w-215 divide-y">
                        {group.containers.map((container) => (
                            <ContainerRow
                                key={container.id}
                                container={container}
                                terminalActive={terminals.includes(
                                    container.id,
                                )}
                                onTerminal={() =>
                                    onContainerTerminal(container.id)
                                }
                            />
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}

function LocalProject({
    group,
    terminalActive,
    ...handlers
}: ProjectHandlers & {
    group: ContainerGroup;
    terminalActive: boolean;
}) {
    return (
        <div className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition hover:border-foreground/20">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <FolderOpen className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
                <EnvironmentLinks
                    details={group.details}
                    className="max-w-full text-sm font-medium"
                >
                    {group.details?.name ?? group.project}
                </EnvironmentLinks>
                {group.details?.path ? (
                    <button
                        type="button"
                        onClick={() => openInIde(group.project!)}
                        title="Open in IDE"
                        className="block max-w-full truncate font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                    >
                        {group.details.path}
                    </button>
                ) : (
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {group.project}
                    </p>
                )}
            </div>
            <div
                className={cn(
                    'flex items-center transition group-focus-within:opacity-100 group-hover:opacity-100',
                    !terminalActive && 'opacity-60',
                )}
            >
                <TerminalButton
                    label={`Open terminal in ${group.project}`}
                    active={terminalActive}
                    onClick={handlers.onTerminal}
                />
                <ProjectActions group={group} {...handlers} />
            </div>
        </div>
    );
}

/* ───────────────────────── Page ───────────────────────── */

export default function Dashboard({
    containers,
    host,
    stats,
    terminals,
    localServers,
    caddy,
}: {
    containers: ContainerGroup[];
    host: Host | null;
    stats?: Stats | null;
    terminals: string[];
    localServers: LocalServer[];
    caddy: CaddyStatus;
}) {
    const [terminalId, setTerminalId] = useState<string | null>(null);
    // Project whose dialog is open: a project name, '' to add a local project.
    const [dialogProject, setDialogProject] = useState<string | null>(null);
    const dialogGroup =
        containers.find((group) => group.project === dialogProject) ?? null;
    const [deleteProject, setDeleteProject] = useState<string | null>(null);
    const deleteGroup =
        containers.find((group) => group.project === deleteProject) ?? null;

    useEffect(() => {
        try {
            setTerminalId(localStorage.getItem(TERMINAL_STORAGE_KEY));
        } catch {
            // Storage unavailable: the terminal just won't reopen on reload.
        }
    }, []);

    const openTerminal = (id: string | null) => {
        setTerminalId(id);

        try {
            if (id) {
                localStorage.setItem(TERMINAL_STORAGE_KEY, id);
            } else {
                localStorage.removeItem(TERMINAL_STORAGE_KEY);
            }
        } catch {
            // Ignore: see above.
        }
    };

    const terminal = useMemo(() => {
        if (terminalId?.startsWith(PROJECT_TERMINAL_PREFIX)) {
            const name = terminalId.slice(PROJECT_TERMINAL_PREFIX.length);
            const group = containers.find((group) => group.project === name);

            return group
                ? {
                      endpoints: projectTerminal,
                      target: name,
                      title: `Terminal · ${name}`,
                      // Without a project location it opens in the home folder.
                      description: group.details?.path
                          ? `Local shell in ${group.details.path}. ${SESSION_NOTE}`
                          : `Local shell in your home folder (no project location set). ${SESSION_NOTE}`,
                  }
                : null;
        }

        const container = containers
            .flatMap((group) => group.containers)
            .find((container) => container.id === terminalId);

        return container
            ? {
                  endpoints: containerTerminal,
                  target: container.id,
                  title: `Terminal · ${container.name}`,
                  description: SESSION_NOTE,
              }
            : null;
    }, [containers, terminalId]);

    // Keep the cards and projects in sync with Docker.
    const { start: startPolling, stop: stopPolling } = usePoll(15000, {
        only: POLLED_PROPS,
    });

    // Pause while a terminal is open: the dev server handles one request at a time,
    // and the slow stats request would freeze the terminal.
    useEffect(() => {
        if (terminal) {
            stopPolling();
        } else {
            startPolling();
        }
    }, [terminal, startPolling, stopPolling]);

    const summary = useMemo(() => {
        const all = containers.flatMap((group) => group.containers);
        const running = all.filter(isRunning).length;
        const ports = all.flatMap((container) => container.ports);

        return {
            total: all.length,
            running,
            stopped: all.length - running,
            projects: containers.filter(
                (group) =>
                    group.project !== null && group.containers.length > 0,
            ).length,
            ports: ports.length,
            webApps: ports.filter((port) => port.url !== null).length,
        };
    }, [containers]);

    const [search, setSearch] = useState('');
    const term = search.trim().toLowerCase();
    const [filter, setFilter] = useState<Filter>('all');

    // Keys of the collapsed groups (project name, or STANDALONE_KEY).
    const [collapsed, setCollapsed] = useState<string[]>([]);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(COLLAPSED_STORAGE_KEY);

            if (saved) {
                setCollapsed(JSON.parse(saved) as string[]);
            }
        } catch {
            // Storage unavailable or invalid: everything starts expanded.
        }
    }, []);

    const toggleCollapsed = (key: string) => {
        const next = collapsed.includes(key)
            ? collapsed.filter((item) => item !== key)
            : [...collapsed, key];

        setCollapsed(next);

        try {
            localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next));
        } catch {
            // Ignore: see above.
        }
    };

    // Projects with containers become cards (busiest first, Standalone last);
    // the ones without containers go to the "Local projects" grid.
    const dockerGroups = useMemo(
        () =>
            containers
                .filter((group) => group.containers.length > 0)
                .map((group) => {
                    const whole = term === '' || projectMatches(group, term);

                    return {
                        ...group,
                        containers: group.containers.filter(
                            (container) =>
                                (filter === 'all' ||
                                    isRunning(container) ===
                                        (filter === 'running')) &&
                                (whole || containerMatches(container, term)),
                        ),
                    };
                })
                .filter((group) => group.containers.length > 0)
                .sort((a, b) => {
                    if (a.project === null || b.project === null) {
                        return a.project === null ? 1 : -1;
                    }

                    return groupSummary(b).running - groupSummary(a).running;
                }),
        [containers, term, filter],
    );

    const localGroups = useMemo(
        () =>
            filter === 'running'
                ? []
                : containers.filter(
                      (group) =>
                          group.project !== null &&
                          group.containers.length === 0 &&
                          (term === '' || projectMatches(group, term)),
                  ),
        [containers, term, filter],
    );

    const handlersFor = (group: ContainerGroup): ProjectHandlers => ({
        onEdit: () => setDialogProject(group.project),
        onTerminal: () =>
            openTerminal(`${PROJECT_TERMINAL_PREFIX}${group.project}`),
        onDelete: () => setDeleteProject(group.project),
    });

    return (
        <>
            <Head title="Dashboard" />
            <div className="mx-auto w-full max-w-350 space-y-6 p-4 sm:p-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard icon={Box} title="Containers">
                        <BigNumber
                            value={summary.running}
                            unit={`/ ${summary.total} running`}
                        />
                        <div className="mt-3">
                            <Meter
                                value={summary.running}
                                max={summary.total}
                                tone="ok"
                            />
                        </div>
                        <p className="mt-auto flex gap-4 pt-4 text-xs text-muted-foreground">
                            <span>
                                <span className="text-foreground">
                                    {summary.stopped}
                                </span>{' '}
                                stopped
                            </span>
                            <span>
                                <span className="text-foreground">
                                    {summary.projects}
                                </span>{' '}
                                {summary.projects === 1
                                    ? 'project'
                                    : 'projects'}
                            </span>
                        </p>
                    </StatCard>

                    <StatCard icon={Cpu} title="Resources">
                        <Deferred data="stats" fallback={<ResourcesFallback />}>
                            <Resources stats={stats} host={host} />
                        </Deferred>
                    </StatCard>

                    <PortsCard
                        ports={summary.ports}
                        webApps={summary.webApps}
                        localServers={localServers}
                    />

                    <CaddyCard caddy={caddy} />
                </div>

                <Toolbar
                    search={search}
                    onSearch={setSearch}
                    filter={filter}
                    onFilter={setFilter}
                    counts={{
                        all: summary.total,
                        running: summary.running,
                        stopped: summary.stopped,
                    }}
                    onAddProject={() => setDialogProject('')}
                />

                {containers.length === 0 ? (
                    <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                        No containers or projects found. Docker may be
                        unavailable.
                    </div>
                ) : (
                    <>
                        <div className="space-y-3">
                            {dockerGroups.length > 0 && (
                                <div
                                    className={cn(
                                        GRID,
                                        'hidden px-4 text-[11px] font-medium tracking-wide text-muted-foreground uppercase lg:grid',
                                    )}
                                >
                                    <span className="pl-5">Container</span>
                                    <span>Image</span>
                                    <span>Status</span>
                                    <span>Ports</span>
                                    <span
                                        className={cn(
                                            ACTIONS_WIDTH,
                                            'text-right',
                                        )}
                                    >
                                        Actions
                                    </span>
                                </div>
                            )}
                            {dockerGroups.map((group) => {
                                const key = group.project ?? STANDALONE_KEY;

                                return (
                                    <ProjectCard
                                        key={key}
                                        group={group}
                                        expanded={!collapsed.includes(key)}
                                        onToggle={() => toggleCollapsed(key)}
                                        terminals={terminals}
                                        onContainerTerminal={openTerminal}
                                        {...handlersFor(group)}
                                    />
                                );
                            })}
                            {dockerGroups.length === 0 && (
                                <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                                    {term
                                        ? `No containers match “${search.trim()}”.`
                                        : `No ${filter === 'all' ? '' : `${filter} `}containers.`}
                                </div>
                            )}
                        </div>

                        {localGroups.length > 0 && (
                            <section>
                                <div className="mb-2 flex items-baseline gap-2">
                                    <h2 className="text-sm font-semibold">
                                        Local projects
                                    </h2>
                                    <span className="text-xs text-muted-foreground">
                                        Not running in Docker
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {localGroups.map((group) => (
                                        <LocalProject
                                            key={group.project}
                                            group={group}
                                            terminalActive={terminals.includes(
                                                `project-${group.project}`,
                                            )}
                                            {...handlersFor(group)}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                )}
            </div>
            {dialogProject !== null &&
                (dialogProject === '' || dialogGroup) && (
                    <ProjectDialog
                        key={dialogProject}
                        project={dialogGroup?.project ?? undefined}
                        details={dialogGroup?.details}
                        open
                        onOpenChange={(open) => {
                            if (!open) {
                                setDialogProject(null);
                            }
                        }}
                    />
                )}
            {deleteGroup?.project && (
                <DeleteProjectDialog
                    key={deleteGroup.project}
                    project={deleteGroup.project}
                    name={deleteGroup.details?.name ?? null}
                    open
                    onOpenChange={(open) => {
                        if (!open) {
                            setDeleteProject(null);
                        }
                    }}
                />
            )}
            {terminal && terminalId && (
                <TerminalDialog
                    // One terminal per container/project: a new key gives a fresh xterm.
                    key={terminalId}
                    endpoints={terminal.endpoints}
                    target={terminal.target}
                    title={terminal.title}
                    description={terminal.description}
                    open
                    onOpenChange={(open) => {
                        if (!open) {
                            openTerminal(null);
                            // Refresh the session markers.
                            router.reload({ only: ['terminals'] });
                        }
                    }}
                />
            )}
        </>
    );
}

Dashboard.layout = {
    breadcrumbs: [
        {
            title: 'Dashboard',
            href: dashboard(),
        },
    ],
};
