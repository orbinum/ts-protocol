type EventConstructor = new (type: string, init?: { detail?: unknown }) => unknown;

/**
 * A page event to dispatch: a `CustomEvent` carrying `detail`, or a plain `Event`
 * without. Taken from `globalThis` (see `page-window.ts`); only called once
 * `getPageWindow()` has found a page, where both constructors exist.
 */
export function createPageEvent(type: string, detail?: unknown): unknown {
    const host = globalThis as { CustomEvent?: EventConstructor; Event?: EventConstructor };
    if (detail === undefined && host.Event !== undefined) return new host.Event(type);
    if (host.CustomEvent === undefined) {
        throw new Error('createPageEvent: this host has no CustomEvent; it is not a page');
    }
    return new host.CustomEvent(type, { detail });
}
