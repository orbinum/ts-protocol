import { describe, it, expect } from 'vitest';
import {
    parseSubtreeRoots,
    InvalidSubtreeRootsError,
    MAX_SUBTREE_ROOTS_PER_CALL,
} from '../../../src/chain/rpc/subtreeRoots';
import { commitmentHexOf } from '../../../src/foundation/encoding/bytes';
import { BN254_R } from '../../../src/foundation/crypto/constants';
import type { RawRpcV2SubtreeRoots } from '../../../src/chain/rpc/types/raw';

const hex = (v: bigint) => commitmentHexOf(v);
/** A well-formed answer for tree 1 from block 0: 130 leaves, three blocks. */
const good = (): RawRpcV2SubtreeRoots => ({
    tree_id: 1,
    level: 6,
    tree_leaves: 130,
    sealed: false,
    root: hex(99n),
    start: 0,
    roots: [hex(1n), hex(2n), hex(3n)],
});

const reason = (raw: unknown, treeId = 1, start = 0, count = 4096) => {
    try {
        parseSubtreeRoots(raw as RawRpcV2SubtreeRoots, treeId, start, count);
        return null;
    } catch (e) {
        expect(e).toBeInstanceOf(InvalidSubtreeRootsError);
        return (e as Error).message;
    }
};

describe('parseSubtreeRoots', () => {
    it('maps a response that answers the request', () => {
        expect(parseSubtreeRoots(good(), 1, 0, 4096)).toEqual({
            treeId: 1,
            level: 6,
            treeLeaves: 130,
            sealed: false,
            root: hex(99n),
            start: 0,
            roots: [hex(1n), hex(2n), hex(3n)],
        });
    });

    it('refuses an answer to another question', () => {
        expect(reason({ ...good(), level: 5 })).toMatch(/level/);
        expect(reason(good(), 2)).toMatch(/tree 1, asked for 2/);
        expect(reason(good(), 1, 1)).toMatch(/start 0, asked for 1/);
    });

    it('refuses a tree size no tree can have', () => {
        for (const tree_leaves of [-1, 1.5, 2 ** 20 + 1, 2 ** 32, Number.NaN]) {
            expect(reason({ ...good(), tree_leaves })).toMatch(/tree_leaves/);
        }
        expect(reason({ ...good(), sealed: 'yes' })).toMatch(/sealed/);
    });

    it('refuses more roots than asked for, than one call serves, or than blocks remain', () => {
        expect(reason(good(), 1, 0, 2)).toMatch(/3 roots, at most 2/);
        expect(reason({ ...good(), roots: [hex(1n), hex(2n), hex(3n), hex(4n)] })).toMatch(
            /at most 3/
        );
        const many = {
            ...good(),
            tree_leaves: 2 ** 20,
            roots: new Array(MAX_SUBTREE_ROOTS_PER_CALL + 1).fill(hex(1n)),
        };
        expect(reason(many)).toMatch(/at most 4096/);
        expect(reason({ ...good(), start: 3 }, 1, 3)).toMatch(/at most 0/);
        expect(reason({ ...good(), roots: 'nope' })).toMatch(/not an array/);
    });

    it('refuses a root or anchor that is not a canonical 32-byte field element', () => {
        for (const bad of [hex(BN254_R), '0x' + 'ff'.repeat(32), '0x12', 42, null]) {
            expect(reason({ ...good(), roots: [hex(1n), bad] })).toMatch(/roots\[1\]/);
            expect(reason({ ...good(), root: bad })).toMatch(/root is not/);
        }
    });

    it('refuses something that is not an answer at all', () => {
        expect(reason(null)).toMatch(/not an object/);
        expect(reason('roots')).toMatch(/not an object/);
    });
});
