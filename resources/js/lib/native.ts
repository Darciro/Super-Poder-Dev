import { openExternal } from '@/routes/native';

declare global {
    interface Window {
        /** Helper exposed by NativePHP's preload script, only in the desktop app. */
        Native?: unknown;
    }
}

/**
 * Whether the page runs inside the desktop app (NativePHP) rather than a browser.
 */
export function isNative(): boolean {
    return window.Native !== undefined;
}

function xsrfToken(): string {
    const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);

    return match ? decodeURIComponent(match[1]) : '';
}

/**
 * In the desktop app, open links that leave it (another site, or `target="_blank"`)
 * in the default browser. Otherwise they would open in a bare window of the app,
 * or take the app's own window away to the other site.
 */
export function openLinksInBrowser(): void {
    if (!isNative()) {
        return;
    }

    // Bubble phase: Inertia's <Link> has already handled (and prevented) app visits.
    document.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0) {
            return;
        }

        const link =
            event.target instanceof Element
                ? event.target.closest('a[href]')
                : null;

        if (!(link instanceof HTMLAnchorElement)) {
            return;
        }

        const url = new URL(link.href, window.location.href);

        if (!['http:', 'https:'].includes(url.protocol)) {
            return;
        }

        if (url.origin === window.location.origin) {
            // A page of the app in a new tab: there are no tabs, open it here.
            if (link.target === '_blank') {
                event.preventDefault();
                window.location.assign(url);
            }

            return;
        }

        event.preventDefault();

        void fetch(openExternal().url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-XSRF-TOKEN': xsrfToken(),
            },
            body: JSON.stringify({ url: url.href }),
        });
    });
}
