import { ORBINUM_METHODS, type OrbinumMethod } from './orbinum-methods';

const METHODS: ReadonlySet<string> = new Set(ORBINUM_METHODS);

/** Whether `method` is one of `window.orbinum`'s. */
export function isOrbinumMethod(method: unknown): method is OrbinumMethod {
    return typeof method === 'string' && METHODS.has(method);
}
