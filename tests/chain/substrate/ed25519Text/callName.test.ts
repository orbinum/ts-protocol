/**
 * Call names from the metadata: the pallet at the call's first byte and its call variant
 * at the second, as the runtime names them.
 */
import { describe, it, expect } from 'vitest';
import { callNameIn } from '../../../../src/chain/substrate/ed25519Text/callName';
import type { CallMetadata } from '../../../../src/chain/substrate/ed25519Text/callName';

const variants = (...names: [index: number, name: string][]) => ({
    tag: 'variant' as const,
    value: names.map(([index, name]) => ({ name, index, fields: [], docs: [] })),
});

/** Two pallets with calls, one without. Lookup ids are the array positions. */
const METADATA = {
    pallets: [
        { name: 'System', index: 0, calls: { type: 0 } },
        { name: 'Balances', index: 4, calls: { type: 1 } },
        { name: 'Timestamp', index: 2, calls: undefined },
    ],
    lookup: [
        { id: 0, path: [], params: [], def: variants([0, 'remark']), docs: [] },
        {
            id: 1,
            path: [],
            params: [],
            def: variants([0, 'transfer_allow_death'], [3, 'transfer_keep_alive']),
            docs: [],
        },
    ],
} as unknown as CallMetadata;

describe('callNameIn', () => {
    it('names the call by pallet index and call index', () => {
        expect(callNameIn(METADATA, Uint8Array.of(4, 3, 0xaa))).toEqual({
            pallet: 'Balances',
            call: 'transfer_keep_alive',
        });
        expect(callNameIn(METADATA, Uint8Array.of(0, 0))).toEqual({
            pallet: 'System',
            call: 'remark',
        });
    });

    it('is null for a pallet index the runtime does not have', () => {
        expect(callNameIn(METADATA, Uint8Array.of(9, 0))).toBeNull();
    });

    it('is null for a call index the pallet does not have', () => {
        expect(callNameIn(METADATA, Uint8Array.of(4, 1))).toBeNull();
    });

    it('is null for a pallet without calls', () => {
        expect(callNameIn(METADATA, Uint8Array.of(2, 0))).toBeNull();
    });

    it('is null for no bytes at all', () => {
        expect(callNameIn(METADATA, new Uint8Array())).toBeNull();
    });
});
