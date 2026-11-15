import { describe, it, expect, vi } from 'vitest';
import { guardedMetadataCache } from '../../../src/chain/substrate/metadataCache';

describe('guardedMetadataCache', () => {
    it('serves a stored metadata and stores a new one by code hash', async () => {
        const store = new Map<string, Uint8Array>([['0xaa', new Uint8Array([1, 2])]]);
        const hooks = guardedMetadataCache({
            get: async (h) => store.get(h) ?? null,
            set: (h, m) => void store.set(h, m),
        });
        expect(await hooks.getMetadata('0xaa')).toEqual(new Uint8Array([1, 2]));
        expect(await hooks.getMetadata('0xbb')).toBeNull();
        hooks.setMetadata('0xbb', new Uint8Array([3]));
        expect(store.get('0xbb')).toEqual(new Uint8Array([3]));
    });

    it('never throws into the client: a failing or empty cache reads as a miss', async () => {
        const hooks = guardedMetadataCache({
            get: async () => {
                throw new Error('quota');
            },
            set: () => {
                throw new Error('quota');
            },
        });
        expect(await hooks.getMetadata('0xaa')).toBeNull();
        expect(() => hooks.setMetadata('0xaa', new Uint8Array([1]))).not.toThrow();
        const rejecting = guardedMetadataCache({
            get: async () => new Uint8Array(),
            set: vi.fn().mockRejectedValue(new Error('x')),
        });
        expect(await rejecting.getMetadata('0xaa')).toBeNull();
        expect(() => rejecting.setMetadata('0xaa', new Uint8Array([1]))).not.toThrow();
    });

    it('scopes entries to the endpoint they came from', async () => {
        const store = new Map<string, Uint8Array>();
        const cache = {
            get: async (k: string) => store.get(k) ?? null,
            set: (k: string, v: Uint8Array) => void store.set(k, v),
        };
        guardedMetadataCache(cache, 'wss://a').setMetadata('0xcode', new Uint8Array([1]));
        await Promise.resolve();
        expect(await guardedMetadataCache(cache, 'wss://a').getMetadata('0xcode')).toEqual(
            new Uint8Array([1])
        );
        expect(await guardedMetadataCache(cache, 'wss://b').getMetadata('0xcode')).toBeNull();
    });
});
