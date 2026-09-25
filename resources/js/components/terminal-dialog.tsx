import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Power, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { RouteDefinition, RouteQueryOptions } from '@/wayfinder';

type Status = 'connecting' | 'running' | 'ended';

type OutputResponse = {
    session: string | null;
    data: string;
    offset: number;
    running: boolean;
};

type Endpoint<TMethod extends 'get' | 'post' | 'delete'> = (
    target: string,
    options?: RouteQueryOptions,
) => RouteDefinition<TMethod>;

/**
 * Session endpoints, e.g. `import * as endpoints from '@/routes/dashboard/containers/terminal'`.
 */
export type TerminalEndpoints = {
    store: Endpoint<'post'>;
    output: Endpoint<'get'>;
    input: Endpoint<'post'>;
    resize: Endpoint<'post'>;
    destroy: Endpoint<'delete'>;
};

type Props = {
    endpoints: TerminalEndpoints;
    /** Route argument of the endpoints (container id or project name). */
    target: string;
    title: string;
    description: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

function xsrfToken(): string {
    const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);

    return match ? decodeURIComponent(match[1]) : '';
}

async function request<T = void>(
    route: { url: string; method: string },
    body?: object,
): Promise<T> {
    const response = await fetch(route.url, {
        method: route.method.toUpperCase(),
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': xsrfToken(),
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    return (response.status === 204 ? undefined : await response.json()) as T;
}

// Keystrokes and output travel base64 encoded: Laravel trims request strings
// (an Enter alone would arrive empty) and TTY output isn't always valid UTF-8.
function encodeBase64(data: string): string {
    return btoa(
        Array.from(new TextEncoder().encode(data), (byte) =>
            String.fromCharCode(byte),
        ).join(''),
    );
}

function decodeBase64(data: string): Uint8Array {
    return Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
}

/**
 * Terminal attached to a persistent shell session (in a container or on this machine).
 *
 * The session lives on the server: closing the modal or reloading the page
 * keeps it (and whatever runs in it) alive, and reopening replays its output.
 */
export function TerminalDialog({
    endpoints,
    target,
    title,
    description,
    open,
    onOpenChange,
}: Props) {
    const [element, setElement] = useState<HTMLDivElement | null>(null);
    const [status, setStatus] = useState<Status>('connecting');
    const terminalRef = useRef<Terminal | null>(null);

    const startSession = useCallback(async () => {
        const terminal = terminalRef.current;

        setStatus('connecting');

        await request(endpoints.store(target), {
            cols: terminal?.cols ?? 80,
            rows: terminal?.rows ?? 24,
        });
    }, [endpoints, target]);

    const endSession = async () => {
        await request(endpoints.destroy(target));
    };

    useEffect(() => {
        if (!open || !element) {
            return;
        }

        const terminal = new Terminal({
            cursorBlink: true,
            fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 13,
            scrollback: 5000,
            theme: { background: '#0a0a0a' },
        });
        const fit = new FitAddon();

        terminal.loadAddon(fit);
        terminal.open(element);
        fit.fit();
        terminal.focus();
        terminalRef.current = terminal;

        let disposed = false;
        let session: string | null = null;
        let offset = 0;

        // Polling sleeps between reads; typing wakes it up for a quick echo.
        let wake: (() => void) | null = null;
        const sleep = (ms: number) =>
            new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, ms);

                wake = () => {
                    clearTimeout(timer);
                    resolve();
                };
            });

        // Keystrokes are sent one request at a time so they arrive in order.
        let pending = '';
        let sending = false;
        const flush = async () => {
            if (sending || pending === '' || disposed) {
                return;
            }

            const data = pending;

            pending = '';
            sending = true;

            try {
                await request(endpoints.input(target), {
                    data: encodeBase64(data),
                });
            } catch {
                // The session ended; the output poll will report it.
            } finally {
                sending = false;
                wake?.();
                void flush();
            }
        };

        const onData = terminal.onData((data) => {
            pending += data;
            void flush();
        });

        let resizeTimer: ReturnType<typeof setTimeout>;
        const onResize = terminal.onResize(({ cols, rows }) => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(
                () =>
                    void request(endpoints.resize(target), {
                        cols,
                        rows,
                    }).catch(() => {}),
                150,
            );
        });

        const observer = new ResizeObserver(() => fit.fit());
        observer.observe(element);

        const poll = async () => {
            try {
                await startSession();
            } catch {
                terminal.writeln('\x1b[31mCould not start the session.\x1b[0m');
            }

            while (!disposed) {
                let received = false;

                try {
                    const response = await request<OutputResponse>(
                        endpoints.output(target, {
                            query: { session: session ?? '', offset },
                        }),
                    );

                    if (disposed) {
                        return;
                    }

                    // A new session started (e.g. after "New session"): clear the old one.
                    if (session !== null && response.session !== session) {
                        terminal.reset();
                    }

                    session = response.session;
                    offset = response.offset;
                    received = response.data !== '';

                    if (received) {
                        terminal.write(decodeBase64(response.data));
                    }

                    setStatus(response.running ? 'running' : 'ended');

                    await sleep(received ? 30 : response.running ? 250 : 1000);
                } catch {
                    await sleep(1000);
                }
            }
        };

        void poll();

        return () => {
            disposed = true;
            wake?.();
            clearTimeout(resizeTimer);
            observer.disconnect();
            onData.dispose();
            onResize.dispose();
            terminal.dispose();
            terminalRef.current = null;
        };
    }, [open, element, endpoints, target, startSession]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="gap-3 sm:max-w-5xl"
                // Escape belongs to the terminal (vim, less, etc.), not to the modal.
                onEscapeKeyDown={(event) => event.preventDefault()}
                onOpenAutoFocus={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {title}
                        <span
                            className={
                                status === 'running'
                                    ? 'size-2 rounded-full bg-green-500'
                                    : status === 'ended'
                                      ? 'size-2 rounded-full bg-muted-foreground'
                                      : 'size-2 animate-pulse rounded-full bg-amber-500'
                            }
                            aria-label={status}
                        />
                    </DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <div className="overflow-hidden rounded-md bg-[#0a0a0a] p-2">
                    <div ref={setElement} className="h-[60vh] w-full" />
                </div>

                <div className="flex justify-end gap-2">
                    {status === 'ended' ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void startSession()}
                        >
                            <RotateCw />
                            New session
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={status !== 'running'}
                            onClick={() => void endSession()}
                        >
                            <Power />
                            End session
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
