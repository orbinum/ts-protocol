/** Moved from wallet-sdk: the leaves a block's shielded-pool events insert. */
import { describe, it, expect } from 'vitest';
import type { EventRecord } from '../../../../src/chain/substrate/types/index';
import { insertedLeaves, mintedLeaves } from '../../../../src/chain/pallet/shielded-pool/leaves';

const C = (n: number) => '0x' + n.toString(16).padStart(64, '0');

const ev = (section: string, method: string, data: Record<string, unknown>): EventRecord =>
    ({ phase: {}, event: { section, method, data } }) as unknown as EventRecord;

/** A codec u32 as the dynamic decoder yields it: an object that serialises to the number. */
const codec = (n: number) => ({ toJSON: () => n });

describe('insertedLeaves', () => {
    it('reads the leaf of a shield, of both transfer outputs, and of an unshield change', () => {
        const leaves = insertedLeaves([
            ev('shieldedPool', 'Shielded', { commitment: C(1), leaf_index: codec(10) }),
            ev('shieldedPool', 'CommitmentsInserted', {
                commitments: [C(2), C(3)],
                leaf_indices: [11, 12],
            }),
            ev('shieldedPool', 'Unshielded', {
                change_commitment: C(4),
                change_leaf_index: codec(13),
            }),
        ]);
        expect([...leaves]).toEqual([
            [C(1), 10],
            [C(2), 11],
            [C(3), 12],
            [C(4), 13],
        ]);
    });

    it('reads events as the node decodes them: positional, codec-wrapped fields', () => {
        // What `queryBlockEvents` yields: numeric keys, every value a codec object.
        const codecOf = (v: unknown) => ({ toJSON: () => v });
        const leaves = insertedLeaves([
            ev('shieldedPool', 'Shielded', {
                0: codecOf('5Grw'),
                1: codecOf('1000'),
                2: codecOf(C(1)),
                3: codecOf('0x00'),
                4: codecOf(10),
            }),
            ev('shieldedPool', 'CommitmentsInserted', {
                0: codecOf([C(2), C(3)]),
                1: codecOf(['0x', '0x']),
                2: codecOf([11, 12]),
            }),
            ev('shieldedPool', 'Unshielded', {
                0: codecOf(C(9)),
                1: codecOf('1'),
                2: codecOf('5Grw'),
                3: codecOf(C(4)),
                4: codecOf('0x'),
                5: codecOf(13),
            }),
        ]);
        expect([...leaves]).toEqual([
            [C(1), 10],
            [C(2), 11],
            [C(3), 12],
            [C(4), 13],
        ]);
    });

    it('keys commitments in lowercase, as notes compare them', () => {
        const upper = '0x' + 'AB'.repeat(32);
        const leaves = insertedLeaves([
            ev('shieldedPool', 'Shielded', { commitment: upper, leaf_index: 7 }),
        ]);
        expect(leaves.get(upper.toLowerCase())).toBe(7);
    });

    it('ignores other pallets, a total unshield, and malformed values', () => {
        const leaves = insertedLeaves([
            ev('balances', 'Shielded', { commitment: C(1), leaf_index: 1 }),
            ev('shieldedPool', 'Unshielded', { change_commitment: null, change_leaf_index: null }),
            ev('shieldedPool', 'Shielded', { commitment: 'nope', leaf_index: 2 }),
            ev('shieldedPool', 'Shielded', { commitment: C(5), leaf_index: -1 }),
            ev('shieldedPool', 'CommitmentsInserted', { commitments: C(6), leaf_indices: 3 }),
            ev('shieldedPool', 'MerkleRootUpdated', { new_root: C(7), tree_size: 9 }),
        ]);
        expect(leaves.size).toBe(0);
    });

    it('a repeated commitment keeps its first leaf', () => {
        const leaves = insertedLeaves([
            ev('shieldedPool', 'Shielded', { commitment: C(1), leaf_index: 4 }),
            ev('shieldedPool', 'Shielded', { commitment: C(1), leaf_index: 9 }),
        ]);
        expect(leaves.get(C(1))).toBe(4);
    });
});

describe('mintedLeaves', () => {
    const mint = (data: Record<string, unknown>) => ev('shieldedPool', 'NoteMinted', data);

    it('reads each NoteMinted: commitment, asset, value and leaf', () => {
        const upper = '0x' + 'AB'.repeat(32);
        expect(
            mintedLeaves([
                ev('balances', 'Transfer', {}),
                mint({ commitment: C(1), asset_id: 2, value: '300', leaf_index: 14 }),
                mint({ commitment: upper, asset_id: codec(0), value: 7n, leaf_index: codec(15) }),
            ])
        ).toEqual([
            { commitment: C(1), assetId: 2, value: 300n, leafIndex: 14 },
            { commitment: upper.toLowerCase(), assetId: 0, value: 7n, leafIndex: 15 },
        ]);
    });

    it('reads events as the node decodes them: positional, codec-wrapped fields', () => {
        const codecOf = (v: unknown) => ({ toJSON: () => v });
        expect(
            mintedLeaves([
                mint({
                    0: codecOf(C(3)),
                    1: codecOf(1),
                    2: codecOf('0x0de0b6b3a7640000'),
                    3: codecOf(9),
                }),
            ])
        ).toEqual([{ commitment: C(3), assetId: 1, value: 10n ** 18n, leafIndex: 9 }]);
    });

    it('skips a malformed mint', () => {
        expect(
            mintedLeaves([
                mint({ commitment: 'nope', asset_id: 0, value: '1', leaf_index: 1 }),
                mint({ commitment: C(1), asset_id: -1, value: '1', leaf_index: 1 }),
                mint({ commitment: C(1), asset_id: 2 ** 32, value: '1', leaf_index: 1 }),
                mint({ commitment: C(1), asset_id: 0, value: 'x', leaf_index: 1 }),
                mint({ commitment: C(1), asset_id: 0, value: -1, leaf_index: 1 }),
                mint({ commitment: C(1), asset_id: 0, value: 1.5, leaf_index: 1 }),
                mint({ commitment: C(1), asset_id: 0, value: '1', leaf_index: -1 }),
            ])
        ).toEqual([]);
    });
});
