import { describe, it, expect } from 'vitest';
import { isValidLeafIndex, treeIdOf, LEAVES_PER_TREE } from '../../../src/protocol/spend/treeIndex';

describe('isValidLeafIndex', () => {
    it('accepts a real u32 position, including zero', () => {
        expect(isValidLeafIndex(0)).toBe(true);
        expect(isValidLeafIndex(LEAVES_PER_TREE)).toBe(true);
        expect(isValidLeafIndex(2 ** 32 - 1)).toBe(true);
    });

    it('rejects the values that break scanning if trusted', () => {
        // NaN makes every same-tree comparison false; Infinity as a cursor
        // resumes past the end of the tree forever. Both come from untrusted
        // scan hints, so both must be caught here.
        for (const bad of [null, undefined, NaN, Infinity, -1, 1.5, 2 ** 32]) {
            expect(isValidLeafIndex(bad as number)).toBe(false);
        }
    });
});

describe('treeIdOf', () => {
    it('maps a leaf index to its forest tree', () => {
        expect(treeIdOf({ leafIndex: 0 })).toBe(0);
        expect(treeIdOf({ leafIndex: LEAVES_PER_TREE - 1 })).toBe(0);
        expect(treeIdOf({ leafIndex: LEAVES_PER_TREE })).toBe(1);
        expect(treeIdOf({ leafIndex: LEAVES_PER_TREE * 3 + 7 })).toBe(3);
    });

    it('falls back to tree 0 for a missing or malformed index', () => {
        expect(treeIdOf({ leafIndex: null as unknown as number })).toBe(0);
        expect(treeIdOf({ leafIndex: NaN })).toBe(0);
        expect(treeIdOf({ leafIndex: -1 })).toBe(0);
    });
});
