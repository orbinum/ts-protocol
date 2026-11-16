import { describe, expect, it } from 'vitest';
import { readLeaf, readTreeSize } from '../../../../src/chain/pallet/shielded-pool/storage/reads';

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
