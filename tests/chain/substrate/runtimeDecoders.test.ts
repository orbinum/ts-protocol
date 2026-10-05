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
});
