import { describe, expect, it } from 'vitest';
import { ShieldedPoolModule } from '../../../../src/chain/pallet/shielded-pool/ShieldedPoolModule';
import {
    readLeaf,
    readTaggedMemosFromLeaf,
    readTreeSize,
} from '../../../../src/chain/pallet/shielded-pool/storage/reads';

const substrate = (leaves: Record<number, unknown>, size: number) =>
    ({
        unsafe: {
            query: {
                ShieldedPool: {
                    MerkleTreeSize: { getValue: async () => size },
                    MerkleLeaves: { getValue: async (i: number) => leaves[i] },
                },
            },
        },
    }) as never;

describe('commitment tree reads', () => {
    it('reads the size and a leaf as lowercase hex, null past the end', async () => {
        const s = substrate({ 0: '0xAB' + '00'.repeat(31), 1: { asHex: () => '0x01' } }, 2);
        expect(await readTreeSize(s)).toBe(2);
        expect(await readLeaf(s, 0)).toBe('0xab' + '00'.repeat(31));
        expect(await readLeaf(s, 1)).toBe('0x01');
        expect(await readLeaf(s, 2)).toBeNull();
        await expect(readLeaf(s, -1)).rejects.toThrow(/leaf.index/);
    });
});

describe('readTaggedMemosFromLeaf', () => {
    const withLeaf = (getValue: () => Promise<unknown>) =>
        ({ unsafe: { query: { ShieldedPool: { TaggedMemosFromLeaf: { getValue } } } } }) as never;

    it('reads the recorded leaf, null while none is recorded', async () => {
        expect(await readTaggedMemosFromLeaf(withLeaf(async () => 1_299_776))).toBe(1_299_776);
        expect(await readTaggedMemosFromLeaf(withLeaf(async () => undefined))).toBeNull();
    });

    it('is null on a runtime without the item, so a wallet decrypts every leaf', async () => {
        expect(
            await readTaggedMemosFromLeaf(
                withLeaf(async () => {
                    throw new Error('Storage ShieldedPool.TaggedMemosFromLeaf not found');
                })
            )
        ).toBeNull();
        expect(await readTaggedMemosFromLeaf({ unsafe: { query: {} } } as never)).toBeNull();
    });

    it('reads None as null and the u32 bounds as themselves', async () => {
        expect(await readTaggedMemosFromLeaf(withLeaf(async () => null))).toBeNull();
        expect(await readTaggedMemosFromLeaf(withLeaf(async () => 0))).toBe(0);
        expect(await readTaggedMemosFromLeaf(withLeaf(async () => 0xffff_ffff))).toBe(0xffff_ffff);
        expect(await readTaggedMemosFromLeaf(withLeaf(async () => 42n))).toBe(42);
    });

    it('throws on a value that is not a u32, never turning it into a leaf', async () => {
        for (const malformed of [
            -1,
            1.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            0x1_0000_0000,
            -1n,
            0x1_0000_0000n,
            '7',
            '0x07',
            true,
            {},
            [7],
        ]) {
            await expect(
                readTaggedMemosFromLeaf(withLeaf(async () => malformed)),
                String(malformed)
            ).rejects.toThrow(/TaggedMemosFromLeaf/);
        }
    });

    it('is what the module reads', async () => {
        const pool = (getValue: () => Promise<unknown>) =>
            new ShieldedPoolModule(withLeaf(getValue));
        expect(await pool(async () => 7).taggedMemosFromLeaf()).toBe(7);
        expect(await pool(async () => undefined).taggedMemosFromLeaf()).toBeNull();
        await expect(pool(async () => '7').taggedMemosFromLeaf()).rejects.toThrow(
            /TaggedMemosFromLeaf/
        );
    });
});
