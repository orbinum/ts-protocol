import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@polkadot-api/metadata-builders', () => ({
    getDynamicBuilder: vi.fn().mockReturnValue('builder'),
    getLookupFn: vi.fn(),
}));
vi.mock('@polkadot-api/substrate-bindings', () => ({
    decAnyMetadata: vi.fn(),
    unifyMetadata: vi.fn(),
}));
vi.mock('@polkadot-api/tx-utils', () => ({
    getExtrinsicDecoder: vi.fn().mockReturnValue('extrinsic'),
}));

import { getDynamicBuilder } from '@polkadot-api/metadata-builders';
import { getExtrinsicDecoder } from '@polkadot-api/tx-utils';
import { RuntimeDecoders } from '../../../src/chain/substrate/runtimeDecoders';

const rpc = (spec = 17) =>
    vi.fn(async (method: string) =>
        method === 'state_getRuntimeVersion' ? { specVersion: spec } : '0x6d657461'
    ) as unknown as <T>(m: string, p: unknown[]) => Promise<T>;

beforeEach(() => vi.clearAllMocks());

describe('RuntimeDecoders', () => {
    it('builds only the decoder asked for', async () => {
        const decoders = new RuntimeDecoders(rpc(), vi.fn());
        expect(await decoders.builder('0xaa')).toBe('builder');
        expect(getExtrinsicDecoder).not.toHaveBeenCalled();
        expect(await decoders.extrinsic('0xaa')).toBe('extrinsic');
        expect(getDynamicBuilder).toHaveBeenCalledTimes(1);
    });

    it('keeps the connected runtime without a hash, fetched once', async () => {
        const connected = vi.fn().mockResolvedValue(new Uint8Array([1]));
        const call = rpc();
        const decoders = new RuntimeDecoders(call, connected);

        await Promise.all([decoders.builder(), decoders.extrinsic(), decoders.builder()]);

        expect(connected).toHaveBeenCalledTimes(1);
        expect(call).not.toHaveBeenCalled();
    });

    it('retries the connected runtime after a failed fetch', async () => {
        const connected = vi
            .fn()
            .mockRejectedValueOnce(new Error('down'))
            .mockResolvedValue(new Uint8Array([1]));
        const decoders = new RuntimeDecoders(rpc(), connected);

        await expect(decoders.builder()).rejects.toThrow('down');
        expect(await decoders.builder()).toBe('builder');
    });

    it('surfaces an unknown block instead of caching anything for it', async () => {
        const call = vi
            .fn()
            .mockRejectedValueOnce(new Error('Unknown block'))
            .mockImplementation(async (m: string) =>
                m === 'state_getRuntimeVersion' ? { specVersion: 17 } : '0x6d'
            ) as unknown as <T>(m: string, p: unknown[]) => Promise<T>;
        const decoders = new RuntimeDecoders(call, vi.fn());

        await expect(decoders.builder('0xbad')).rejects.toThrow('Unknown block');
        expect(await decoders.builder('0xbad')).toBe('builder');
    });

    it('drops the oldest runtime once 16 are cached', async () => {
        // A node that claims a new spec for every block must not grow the cache.
        let spec = 0;
        const blockSpec = new Map<string, number>();
        const call = vi.fn(async (method: string, params: unknown[]) => {
            const hash = params[0] as string;
            if (method === 'state_getRuntimeVersion') {
                if (!blockSpec.has(hash)) blockSpec.set(hash, ++spec);
                return { specVersion: blockSpec.get(hash) };
            }
            return '0x6d657461';
        }) as unknown as <T>(m: string, p: unknown[]) => Promise<T>;
        const decoders = new RuntimeDecoders(call, vi.fn());
        const metadataFetches = () =>
            (call as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
                (c) => c[0] === 'state_getMetadata'
            ).length;

        for (let i = 0; i < 17; i++) await decoders.builder(`0x${i}`);
        expect(metadataFetches()).toBe(17);

        await decoders.builder('0x16'); // newest: still cached
        expect(metadataFetches()).toBe(17);
        await decoders.builder('0x0'); // oldest: evicted, fetched again
        expect(metadataFetches()).toBe(18);
    });
});
