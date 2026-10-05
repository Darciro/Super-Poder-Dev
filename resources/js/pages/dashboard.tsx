import { Deferred, Head, router, usePoll } from "@inertiajs/react";
import type { LucideIcon } from "lucide-react";
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Boxes,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    Cpu,
    FolderOpen,
    Plus,
    MoreHorizontal,
    Network,
    Globe,
    Play,
    RotateCw,
    Search,
    Square,
    Trash2,
    SquareTerminal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { TerminalDialog } from "@/components/terminal-dialog";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { ENVIRONMENTS, ProjectDialog } from "@/components/project-dialog";
import type { ProjectDetails } from "@/components/project-dialog";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { dashboard } from "@/routes";
import { action as caddyAction } from "@/routes/dashboard/caddy";
import { action as containerAction } from "@/routes/dashboard/containers";
import { openIde } from "@/routes/dashboard/projects";
import * as containerTerminal from "@/routes/dashboard/containers/terminal";
import * as projectTerminal from "@/routes/dashboard/projects/terminal";

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

function formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${value.toFixed(unit >= 3 ? 1 : 0)} ${units[unit]}`;
}

function StatCard({
    icon: Icon,
    title,
    children,
}: {
    icon: LucideIcon;
    title: string;
    children: ReactNode;
}) {
    return (
        <div className="flex min-h-40 flex-col gap-3 rounded-xl border border-sidebar-border/70 p-4 md:aspect-video dark:border-sidebar-border">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Icon className="size-4" />
                {title}
            </div>
            <div className="flex flex-1 flex-col justify-between gap-3">
                {children}
            </div>
        </div>
    );
}

function Meter({
    value,
    max,
    className,
}: {
    value: number;
    max: number;
    className?: string;
}) {
    const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;

    return (
        <div
            className={cn(
                "h-1.5 w-full overflow-hidden rounded-full bg-muted",
                className,
            )}
        >
            <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${percent}%` }}
            />
        </div>
    );
}

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

    return (
        <>
            <div className="flex flex-col gap-3">
                <div>
                    <div className="flex items-baseline justify-between text-sm">
                        <span>CPU</span>
                        <span className="tabular-nums">
                            {stats.cpu.toFixed(1)}%
                            {host && (
                                <span className="text-muted-foreground">
                                    {" "}
                                    of {host.cpus} CPUs
                                </span>
                            )}
                        </span>
                    </div>
                    <Meter
                        value={stats.cpu}
                        max={cpuCapacity}
                        className="mt-1.5"
                    />
                </div>
                <div>
                    <div className="flex items-baseline justify-between text-sm">
                        <span>Memory</span>
                        <span className="tabular-nums">
                            {formatBytes(stats.memory)}
                            {host && (
                                <span className="text-muted-foreground">
                                    {" "}
                                    / {formatBytes(host.memory)}
                                </span>
                            )}
                        </span>
                    </div>
                    <Meter
                        value={stats.memory}
                        max={host?.memory ?? stats.memory}
                        className="mt-1.5"
                    />
                </div>
            </div>
            {stats.top.length > 0 && (
                <p className="truncate text-sm text-muted-foreground">
                    Top:{" "}
                    {stats.top
                        .map(
                            (container) =>
                                `${container.name} ${formatBytes(container.memory)}`,
                        )
                        .join(" · ")}
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

function CaddyCard({ caddy }: { caddy: CaddyStatus }) {
    const [processing, setProcessing] = useState(false);
    const ports = [...new Set(caddy.sites.map((site) => site.port))].sort(
        (a, b) => a - b,
    );

    const run = (action: "start" | "stop") => {
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
        <StatCard icon={Globe} title="Caddy">
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-3xl font-semibold tabular-nums">
                        {caddy.sites.length}
                        <span className="text-lg font-normal text-muted-foreground">
                            {" "}
                            {caddy.sites.length === 1 ? "host" : "hosts"}
                        </span>
                    </p>
                    <span
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                            caddy.running
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground",
                        )}
                    >
                        <span
                            className={cn(
                                "size-1.5 rounded-full",
                                caddy.running
                                    ? "bg-emerald-500"
                                    : "bg-muted-foreground",
                            )}
                        />
                        {caddy.running ? "Running" : "Stopped"}
                    </span>
                </div>
                {caddy.exists ? (
                    <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                        {caddy.sites.map((site) => (
                            <a
                                key={site.address}
                                href={`${site.port === 80 ? "http" : "https"}://${site.host}${[80, 443].includes(site.port) ? "" : `:${site.port}`}`}
                                target="_blank"
                                rel="noreferrer"
                                title={`${site.address} → ${site.upstreams.join(", ") || "no reverse_proxy"}`}
                                className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground hover:underline"
                            >
                                :{site.port}
                                <span className="text-muted-foreground">
                                    →{" "}
                                    {site.upstreams
                                        .map((upstream) =>
                                            upstream.split(":").pop(),
                                        )
                                        .join(", ") || "—"}
                                </span>
                            </a>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Caddyfile not found at{" "}
                        <span className="font-mono">{caddy.config}</span>.
                    </p>
                )}
            </div>
            <div className="flex items-center justify-between gap-2">
                <p
                    className="truncate text-sm text-muted-foreground"
                    title={caddy.config}
                >
                    {ports.length > 0
                        ? `Ports ${ports.join(", ")}`
                        : "No ports"}
                </p>
                {caddy.running ? (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={processing}
                        onClick={() => run("stop")}
                    >
                        {processing ? <Spinner /> : <Square />}
                        Stop
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={processing || !caddy.exists}
                        onClick={() => run("start")}
                    >
                        {processing ? <Spinner /> : <Play />}
                        Start
                    </Button>
                )}
            </div>
        </StatCard>
    );
}

type ContainerActionName = "start" | "stop" | "restart";

function ContainerActions({
    container,
    onTerminal,
}: {
    container: Container;
    onTerminal: () => void;
}) {
    const [processing, setProcessing] = useState(false);
    const running = container.state === "running";

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
        // Non-modal so focus can move straight into the terminal modal.
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    disabled={processing}
                    aria-label={`Actions for ${container.name}`}
                >
                    {processing ? <Spinner /> : <MoreHorizontal />}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {running ? (
                    <DropdownMenuItem onSelect={() => run("stop")}>
                        <Square />
                        Stop
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem onSelect={() => run("start")}>
                        <Play />
                        Start
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => run("restart")}>
                    <RotateCw />
                    Restart
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!running} onSelect={onTerminal}>
                    <SquareTerminal />
                    Terminal
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

const ENVIRONMENT_STYLES: Record<(typeof ENVIRONMENTS)[number]["key"], string> =
    {
        url_local:
            "border-slate-500/30 bg-slate-500/10 text-slate-700 hover:bg-slate-500/20 dark:text-slate-300",
        url_dev:
            "border-sky-500/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300",
        url_qa: "border-violet-500/30 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 dark:text-violet-300",
        url_staging:
            "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300",
        url_production:
            "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
    };

function hostname(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

/**
 * Project title that opens a panel of the configured environment tiles (each opens its URL in a new tab).
 */
function EnvironmentLinks({
    details,
    children,
}: {
    details: ProjectDetails | null;
    children: ReactNode;
}) {
    const environments = ENVIRONMENTS.flatMap(({ key, label }) => {
        const url = details?.[key];

        return url ? [{ key, label, url }] : [];
    });

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger className="inline-flex cursor-pointer items-center gap-1 rounded underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                {children}
                <ChevronDown className="size-3.5 text-muted-foreground" />
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
                                    "flex cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-3 py-2",
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
                        No environments configured. Add their URLs in Actions →
                        Project.
                    </p>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function ProjectActions({
    group,
    onEdit,
    onTerminal,
    onDelete,
}: {
    group: ContainerGroup;
    onEdit: () => void;
    onTerminal: () => void;
    onDelete: () => void;
}) {
    // Only projects without containers: for a Docker project, "delete" would read as
    // deleting its containers (its details can be cleared in the Project dialog).
    const deletable = group.details !== null && group.containers.length === 0;

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for ${group.project}`}
                >
                    <MoreHorizontal />
                </Button>
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

// Remembers the open terminal so it reopens after a page reload:
// a container id, or "project:{name}" for a project's local terminal.
const TERMINAL_STORAGE_KEY = "dashboard.terminal";
const PROJECT_TERMINAL_PREFIX = "project:";

const SESSION_NOTE =
    "The session keeps running when you close this window or reload the page.";

type SortColumn = "name" | "image" | "state" | "ports";
type Sort = { column: SortColumn; direction: "asc" | "desc" } | null;

const SORT_STORAGE_KEY = "dashboard.sort";
const COLLAPSED_STORAGE_KEY = "dashboard.collapsed";

const STANDALONE_KEY = "__standalone";

// "asc" lists healthy containers first.
const STATE_ORDER = [
    "running",
    "restarting",
    "paused",
    "created",
    "exited",
    "dead",
];

function lowestPort(ports: Port[]): number | null {
    const numbers = ports.map((port) => parseInt(port.label, 10));

    return numbers.length > 0 ? Math.min(...numbers) : null;
}

function containerSortValue(
    container: Container,
    column: SortColumn,
): string | number | null {
    switch (column) {
        case "name":
            return (container.service ?? container.name).toLowerCase();
        case "image":
            return container.image.toLowerCase();
        case "state": {
            const index = STATE_ORDER.indexOf(container.state);

            return index === -1 ? STATE_ORDER.length : index;
        }
        case "ports":
            return lowestPort(container.ports);
    }
}

function groupSortValue(
    group: ContainerGroup,
    column: SortColumn,
): string | number | null {
    const { containers } = group;

    switch (column) {
        case "name":
            return (group.details?.name ?? group.project ?? "").toLowerCase();
        case "image":
            return (
                containers
                    .map((container) => container.image.toLowerCase())
                    .sort()[0] ?? null
            );
        case "state":
            // Share of containers running, negated so "asc" lists the healthiest first.
            return containers.length > 0
                ? -containers.filter(
                      (container) => container.state === "running",
                  ).length / containers.length
                : null;
        case "ports":
            return lowestPort(
                containers.flatMap((container) => container.ports),
            );
    }
}

/**
 * Compare sort values; empty values (no containers, no ports) always go last.
 */
function compare(
    a: string | number | null,
    b: string | number | null,
    direction: "asc" | "desc",
): number {
    if (a === b) {
        return 0;
    }

    if (a === null) {
        return 1;
    }

    if (b === null) {
        return -1;
    }

    const result =
        typeof a === "number" && typeof b === "number"
            ? a - b
            : String(a).localeCompare(String(b), undefined, { numeric: true });

    return direction === "asc" ? result : -result;
}

/**
 * Sort the projects and the containers inside them. Standalone stays last.
 */
function sortGroups(groups: ContainerGroup[], sort: Sort): ContainerGroup[] {
    if (sort === null) {
        return groups;
    }

    const { column, direction } = sort;

    return groups
        .map((group) => ({
            ...group,
            containers: [...group.containers].sort((a, b) =>
                compare(
                    containerSortValue(a, column),
                    containerSortValue(b, column),
                    direction,
                ),
            ),
        }))
        .sort((a, b) => {
            if (a.project === null || b.project === null) {
                return a.project === null ? 1 : -1;
            }

            return compare(
                groupSortValue(a, column),
                groupSortValue(b, column),
                direction,
            );
        });
}

function SortableHeader({
    column,
    sort,
    onSort,
    children,
}: {
    column: SortColumn;
    sort: Sort;
    onSort: (column: SortColumn) => void;
    children: ReactNode;
}) {
    const direction = sort?.column === column ? sort.direction : null;
    const Icon =
        direction === "asc"
            ? ArrowUp
            : direction === "desc"
              ? ArrowDown
              : ArrowUpDown;

    return (
        <th
            className="p-3 font-medium"
            aria-sort={
                direction === "asc"
                    ? "ascending"
                    : direction === "desc"
                      ? "descending"
                      : "none"
            }
        >
            <button
                type="button"
                onClick={() => onSort(column)}
                className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground"
            >
                {children}
                <Icon
                    className={cn(
                        "size-3.5",
                        direction
                            ? "text-foreground"
                            : "text-muted-foreground/60",
                    )}
                />
            </button>
        </th>
    );
}

function containerMatches(container: Container, term: string): boolean {
    return [container.name, container.service, container.image]
        .filter((value): value is string => value !== null)
        .some((value) => value.toLowerCase().includes(term));
}

function groupMatches(group: ContainerGroup, term: string): boolean {
    return (
        [group.project ?? "standalone", group.details?.name ?? ""].some(
            (value) => value.toLowerCase().includes(term),
        ) ||
        group.containers.some((container) => containerMatches(container, term))
    );
}

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

    // Keep the cards and table in sync with Docker.
    const { start: startPolling, stop: stopPolling } = usePoll(15000, {
        only: [
            "containers",
            "host",
            "stats",
            "terminals",
            "localServers",
            "caddy",
        ],
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
        const running = all.filter(
            (container) => container.state === "running",
        ).length;
        const ports = all.flatMap((container) => container.ports);

        return {
            total: all.length,
            running,
            stopped: all.length - running,
            projects: containers.filter((group) => group.project !== null)
                .length,
            ports: ports.length,
            webApps: ports.filter((port) => port.url !== null).length,
        };
    }, [containers]);

    const [search, setSearch] = useState("");
    const term = search.trim().toLowerCase();

    const [sort, setSort] = useState<Sort>(null);

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

    useEffect(() => {
        try {
            const saved = localStorage.getItem(SORT_STORAGE_KEY);

            if (saved) {
                setSort(JSON.parse(saved) as Sort);
            }
        } catch {
            // Storage unavailable or invalid: keep the default order.
        }
    }, []);

    // Each click on a column: ascending → descending → default order.
    const toggleSort = (column: SortColumn) => {
        const next: Sort =
            sort?.column !== column
                ? { column, direction: "asc" }
                : sort.direction === "asc"
                  ? { column, direction: "desc" }
                  : null;

        setSort(next);

        try {
            if (next) {
                localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
            } else {
                localStorage.removeItem(SORT_STORAGE_KEY);
            }
        } catch {
            // Ignore: see above.
        }
    };

    // Matching groups move to the top (keeping the sorted order);
    // the rest stay below, dimmed. An empty search keeps the sorted order.
    const groups = useMemo(() => {
        const sorted = sortGroups(containers, sort);

        if (term === "") {
            return sorted.map((group) => ({ group, matches: true }));
        }

        const marked = sorted.map((group) => ({
            group,
            matches: groupMatches(group, term),
        }));

        return [
            ...marked.filter(({ matches }) => matches),
            ...marked.filter(({ matches }) => !matches),
        ];
    }, [containers, term, sort]);

    return (
        <>
            <Head title="Dashboard" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="grid auto-rows-min gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard icon={Boxes} title="Containers">
                        <div>
                            <p className="text-3xl font-semibold tabular-nums">
                                {summary.running}
                                <span className="text-lg font-normal text-muted-foreground">
                                    {" "}
                                    / {summary.total} running
                                </span>
                            </p>
                            <Meter
                                value={summary.running}
                                max={summary.total}
                                className="mt-3"
                            />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {summary.stopped} stopped · {summary.projects}{" "}
                            {summary.projects === 1 ? "project" : "projects"}
                        </p>
                    </StatCard>

                    <StatCard icon={Cpu} title="Resources">
                        <Deferred data="stats" fallback={<ResourcesFallback />}>
                            <Resources stats={stats} host={host} />
                        </Deferred>
                    </StatCard>

                    <StatCard icon={Network} title="Ports">
                        <div>
                            <p className="text-3xl font-semibold tabular-nums">
                                {summary.ports}
                                <span className="text-lg font-normal text-muted-foreground">
                                    {" "}
                                    open
                                </span>
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {summary.webApps}{" "}
                                {summary.webApps === 1 ? "web app" : "web apps"}{" "}
                                reachable in the browser
                            </p>
                            {localServers.length > 0 && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                                    <span>
                                        {localServers.length} running from the
                                        terminal:
                                    </span>
                                    {localServers.map((server) => (
                                        <a
                                            key={server.pid}
                                            href={server.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            title={`php -S ${server.address}${server.path ? ` · ${server.path}` : ""} (PID ${server.pid})`}
                                            className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground hover:underline"
                                        >
                                            {server.name ?? server.address}
                                            <span className="text-muted-foreground">
                                                :
                                                {server.address
                                                    .split(":")
                                                    .pop()}
                                            </span>
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                        {host && (
                            <p className="text-sm text-muted-foreground">
                                {host.os} {host.version} · {host.cpus} CPUs ·{" "}
                                {formatBytes(host.memory)} · {host.images}{" "}
                                images
                            </p>
                        )}
                    </StatCard>

                    <CaddyCard caddy={caddy} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full max-w-sm">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search containers..."
                            aria-label="Search containers"
                            className="pl-9"
                        />
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setDialogProject("")}
                    >
                        <Plus />
                        Add local project
                    </Button>
                </div>
                <div className="relative min-h-[100vh] flex-1 overflow-x-auto rounded-xl border border-sidebar-border/70 md:min-h-min dark:border-sidebar-border">
                    {containers.length === 0 ? (
                        <p className="p-4 text-muted-foreground">
                            No containers or projects found. Docker may be
                            unavailable.
                        </p>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-sidebar-border/70 dark:border-sidebar-border">
                                <tr className="align-middle">
                                    <SortableHeader
                                        column="name"
                                        sort={sort}
                                        onSort={toggleSort}
                                    >
                                        Name
                                    </SortableHeader>
                                    <SortableHeader
                                        column="image"
                                        sort={sort}
                                        onSort={toggleSort}
                                    >
                                        Image
                                    </SortableHeader>
                                    <SortableHeader
                                        column="state"
                                        sort={sort}
                                        onSort={toggleSort}
                                    >
                                        State
                                    </SortableHeader>
                                    <th className="p-3 font-medium">Status</th>
                                    <SortableHeader
                                        column="ports"
                                        sort={sort}
                                        onSort={toggleSort}
                                    >
                                        Ports
                                    </SortableHeader>
                                    <th className="p-3 text-right font-medium">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            {groups.map(({ group, matches }) => {
                                const running = group.containers.filter(
                                    (container) =>
                                        container.state === "running",
                                ).length;
                                const groupKey =
                                    group.project ?? STANDALONE_KEY;
                                const expanded = !collapsed.includes(groupKey);

                                return (
                                    <tbody
                                        key={groupKey}
                                        className={
                                            matches
                                                ? undefined
                                                : "opacity-40 transition-opacity"
                                        }
                                    >
                                        <tr className="align-middle border-b border-sidebar-border/70 bg-muted/50 hover:bg-muted/60 hdark:border-sidebar-border">
                                            <td
                                                colSpan={5}
                                                className="relative p-3 font-semibold"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        toggleCollapsed(
                                                            groupKey,
                                                        )
                                                    }
                                                    aria-expanded={expanded}
                                                    aria-label={`${expanded ? "Collapse" : "Expand"} ${group.project ?? "Standalone"}`}
                                                    className="mr-1.5 -ml-1 inline-flex size-6 items-center justify-center rounded align-middle text-muted-foreground hover:bg-muted hover:text-foreground"
                                                >
                                                    <ChevronRight
                                                        className={cn(
                                                            "size-4 transition-transform",
                                                            expanded &&
                                                                "rotate-90",
                                                        )}
                                                    />
                                                </button>
                                                {group.project ? (
                                                    <EnvironmentLinks
                                                        details={group.details}
                                                    >
                                                        {group.details?.name ??
                                                            group.project}
                                                    </EnvironmentLinks>
                                                ) : (
                                                    "Standalone"
                                                )}
                                                {group.details?.name && (
                                                    <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                                                        {group.project}
                                                    </span>
                                                )}
                                                <span className="ml-2 font-normal text-muted-foreground">
                                                    {group.containers.length > 0
                                                        ? `${running}/${group.containers.length} running`
                                                        : "no containers"}
                                                </span>
                                                {group.project &&
                                                    terminals.includes(
                                                        `project-${group.project}`,
                                                    ) && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                openTerminal(
                                                                    `${PROJECT_TERMINAL_PREFIX}${group.project}`,
                                                                )
                                                            }
                                                            title="Local terminal session running"
                                                            aria-label={`Open local terminal for ${group.project}`}
                                                            className="ml-2 inline-flex align-middle text-green-600 hover:text-green-500 dark:text-green-400"
                                                        >
                                                            <SquareTerminal className="size-4" />
                                                        </button>
                                                    )}
                                                {group.project &&
                                                    group.details?.path && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                router.post(
                                                                    openIde.url(
                                                                        group.project!,
                                                                    ),
                                                                    {},
                                                                    {
                                                                        preserveScroll: true,
                                                                    },
                                                                )
                                                            }
                                                            className="absolute top-1/2 right-3 inline-flex -translate-y-1/2 cursor-pointer items-center gap-1 font-mono text-xs font-normal text-muted-foreground hover:text-foreground hover:underline"
                                                            title="Open in IDE"
                                                        >
                                                            <FolderOpen className="size-3.5" />
                                                            {group.details.path}
                                                        </button>
                                                    )}
                                            </td>
                                            <td className="px-3 py-1 text-right">
                                                {group.project && (
                                                    <ProjectActions
                                                        group={group}
                                                        onEdit={() =>
                                                            setDialogProject(
                                                                group.project,
                                                            )
                                                        }
                                                        onTerminal={() =>
                                                            openTerminal(
                                                                `${PROJECT_TERMINAL_PREFIX}${group.project}`,
                                                            )
                                                        }
                                                        onDelete={() =>
                                                            setDeleteProject(
                                                                group.project,
                                                            )
                                                        }
                                                    />
                                                )}
                                            </td>
                                        </tr>
                                        {expanded &&
                                            group.containers.length === 0 && (
                                                <tr className="border-b border-sidebar-border/70 dark:border-sidebar-border">
                                                    <td
                                                        colSpan={6}
                                                        className="p-3 pl-6 text-muted-foreground"
                                                    >
                                                        Local project, not
                                                        running in Docker.
                                                    </td>
                                                </tr>
                                            )}
                                        {expanded &&
                                            group.containers.map(
                                                (container) => (
                                                    <tr
                                                        key={container.id}
                                                        className="align-middle border-b border-sidebar-border/70 dark:border-sidebar-border hover:bg-muted/10"
                                                    >
                                                        <td className="p-3 pl-6 font-medium">
                                                            {container.service ??
                                                                container.name}
                                                            {container.service && (
                                                                <span className="ml-2 font-normal text-muted-foreground">
                                                                    {
                                                                        container.name
                                                                    }
                                                                </span>
                                                            )}
                                                            {terminals.includes(
                                                                container.id,
                                                            ) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        openTerminal(
                                                                            container.id,
                                                                        )
                                                                    }
                                                                    title="Terminal session running"
                                                                    aria-label={`Open terminal for ${container.name}`}
                                                                    className="ml-2 inline-flex align-middle text-green-600 hover:text-green-500 dark:text-green-400"
                                                                >
                                                                    <SquareTerminal className="size-4" />
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td className="p-3">
                                                            {container.image}
                                                        </td>
                                                        <td className="p-3">
                                                            <span
                                                                className={
                                                                    container.state ===
                                                                    "running"
                                                                        ? "text-green-600 dark:text-green-400"
                                                                        : "text-muted-foreground"
                                                                }
                                                            >
                                                                {
                                                                    container.state
                                                                }
                                                            </span>
                                                        </td>
                                                        <td className="p-3">
                                                            {container.status}
                                                        </td>
                                                        <td className="p-3">
                                                            {container.ports
                                                                .length ===
                                                            0 ? (
                                                                "—"
                                                            ) : (
                                                                <div className="flex flex-col gap-1">
                                                                    {container.ports.map(
                                                                        (
                                                                            port,
                                                                        ) =>
                                                                            port.url ? (
                                                                                <a
                                                                                    key={
                                                                                        port.label
                                                                                    }
                                                                                    href={
                                                                                        port.url
                                                                                    }
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
                                                                                >
                                                                                    {port.url.replace(
                                                                                        /^https?:\/\//,
                                                                                        "",
                                                                                    )}
                                                                                </a>
                                                                            ) : (
                                                                                <span
                                                                                    key={
                                                                                        port.label
                                                                                    }
                                                                                >
                                                                                    {
                                                                                        port.label
                                                                                    }
                                                                                </span>
                                                                            ),
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="p-3 text-right">
                                                            <ContainerActions
                                                                container={
                                                                    container
                                                                }
                                                                onTerminal={() =>
                                                                    openTerminal(
                                                                        container.id,
                                                                    )
                                                                }
                                                            />
                                                        </td>
                                                    </tr>
                                                ),
                                            )}
                                    </tbody>
                                );
                            })}
                        </table>
                    )}
                </div>
            </div>
            {dialogProject !== null &&
                (dialogProject === "" || dialogGroup) && (
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
                            // Refresh the session markers in the table.
                            router.reload({ only: ["terminals"] });
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
            title: "Dashboard",
            href: dashboard(),
        },
    ],
};
