import type { PageWindow } from './page-window';

/**
 * The page's `window`, or null where there is none: Node, React Native, a worker, an
 * extension's service worker. Read through `globalThis` so the check itself never
 * throws a `ReferenceError`, which is how naming `window` off-page fails.
 */
export function getPageWindow(): PageWindow | null {
    const candidate = (globalThis as { window?: unknown }).window;
    if (typeof candidate !== 'object' || candidate === null) return null;
    const page = candidate as Partial<PageWindow>;
    return typeof page.addEventListener === 'function' &&
        typeof page.removeEventListener === 'function' &&
        typeof page.dispatchEvent === 'function'
        ? (candidate as PageWindow)
        : null;
}
