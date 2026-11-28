/**
 * The slice of a browser `window` the provider uses, typed here because this package
 * compiles without `lib.dom`: it also runs in Node, React Native and workers, where
 * neither the types nor the object exist.
 */

/** An event as a listener receives it: a `CustomEvent` carries `detail`. */
export interface PageEvent {
    readonly type: string;
    readonly detail?: unknown;
}

export type PageEventListener = (event: PageEvent) => void;

export interface PageWindow {
    addEventListener(type: string, listener: PageEventListener): void;
    removeEventListener(type: string, listener: PageEventListener): void;
    dispatchEvent(event: unknown): boolean;
    /** Where Orbinum Wallet puts its provider. */
    orbinum?: unknown;
}
