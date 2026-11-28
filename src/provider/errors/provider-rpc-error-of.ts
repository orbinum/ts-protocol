import { ProviderRpcError } from './provider-rpc-error';

/**
 * `error` as a `ProviderRpcError`, or null when it is not one.
 *
 * Matched by shape as well as by class: what a provider rejects with has usually
 * crossed `postMessage` as a plain `{ code, message }`, and another provider (or a
 * second copy of this package) has its own class. Either reads the same here.
 */
export function providerRpcErrorOf(error: unknown): ProviderRpcError | null {
    if (error instanceof ProviderRpcError) return error;
    if (typeof error !== 'object' || error === null) return null;
    const { code, message, data } = error as { code?: unknown; message?: unknown; data?: unknown };
    if (typeof code !== 'number' || !Number.isInteger(code) || typeof message !== 'string') {
        return null;
    }
    return new ProviderRpcError(code, message, data);
}
