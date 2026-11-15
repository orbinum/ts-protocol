/**
 * Where a client keeps runtime metadata between connections, keyed by the runtime's code
 * hash (`:code`): connecting then skips downloading it (hundreds of KB) unless the runtime
 * changed. Any store works — IndexedDB in a browser, a file on a server.
 *
 * A failing cache never fails the connection: a read error reads as a miss and a write
 * error is ignored (`guardedMetadataCache`). Entries are scoped to the endpoint they came
 * from, so metadata one node served is never trusted for another.
 */
export interface MetadataCache {
    /** The metadata stored for `codeHash`, or null when none. */
    get(codeHash: string): Promise<Uint8Array | null>;
    /** Stores the metadata of `codeHash`. */
    set(codeHash: string, metadata: Uint8Array): void | Promise<void>;
}

/**
 * PAPI's `createClient` metadata hooks over `cache`, which can never throw into the
 * client; keys are `scope|codeHash` when `scope` (the endpoint) is given.
 */
export function guardedMetadataCache(
    cache: MetadataCache,
    scope?: string
): {
    getMetadata: (codeHash: string) => Promise<Uint8Array | null>;
    setMetadata: (codeHash: string, metadata: Uint8Array) => void;
} {
    const key = (codeHash: string) => (scope ? `${scope}|${codeHash}` : codeHash);
    return {
        getMetadata: async (codeHash) => {
            try {
                const hit = await cache.get(key(codeHash));
                return hit instanceof Uint8Array && hit.length > 0 ? hit : null;
            } catch {
                return null;
            }
        },
        setMetadata: (codeHash, metadata) => {
            try {
                void Promise.resolve(cache.set(key(codeHash), metadata)).catch(() => {});
            } catch {
                /* a cache that cannot write is a cache that misses next time */
            }
        },
    };
}
