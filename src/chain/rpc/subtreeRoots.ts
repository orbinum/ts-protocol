/**
 * Checks on a `privacy_getSubtreeRoots` response before anything uses it.
 *
 * The node is not trusted. A wrong root can never make a spend steal (the
 * chain verifies the proof), but an unchecked one can make a wallet build a
 * path that fails on chain after a proof was paid for, or hold memory the
 * response did not justify. Every field is checked against the request and the
 * forest geometry; anything off throws {@link InvalidSubtreeRootsError}.
 */
import { BN254_R } from '../../foundation/crypto/constants';
import { leHexToBigint } from '../../foundation/encoding/bytes';
import { isHexOfLength } from '../../foundation/encoding/hex';
import { LEAVES_PER_TREE } from '../../protocol/spend/treeIndex';
import { LEAVES_PER_BLOCK, SUBTREE_LEVEL } from '../../protocol/merkle/localPath';
import type { RawRpcV2SubtreeRoots } from './types/raw';
import type { RpcV2SubtreeRoots } from './types/index';

/** Roots the node serves per call, at most. */
export const MAX_SUBTREE_ROOTS_PER_CALL = 4096;

/** A `privacy_getSubtreeRoots` response that does not answer the request it was sent for. */
export class InvalidSubtreeRootsError extends Error {
    constructor(reason: string) {
        super(`invalid subtree roots: ${reason}`);
        this.name = 'InvalidSubtreeRootsError';
    }
}

const isCanonicalHex32 = (hex: unknown): hex is string =>
    typeof hex === 'string' && isHexOfLength(hex, 32) && leHexToBigint(hex) < BN254_R;

const isU32 = (n: unknown): n is number =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) < 2 ** 32;

/**
 * `raw`, mapped, once it is shown to answer `treeId`, `start` and `count`:
 *
 * 1. the level is the one subtree roots live at;
 * 2. tree and start are the ones asked for;
 * 3. the tree holds at most `LEAVES_PER_TREE` leaves;
 * 4. there are no more roots than asked for, than one call serves, or than the
 *    tree has blocks past `start`;
 * 5. every root, and the anchoring root, is a canonical 32-byte field element.
 */
export function parseSubtreeRoots(
    raw: RawRpcV2SubtreeRoots,
    treeId: number,
    start: number,
    count: number
): RpcV2SubtreeRoots {
    const fail = (reason: string): never => {
        throw new InvalidSubtreeRootsError(reason);
    };
    if (!raw || typeof raw !== 'object') fail('not an object');
    // 1.
    if (raw.level !== SUBTREE_LEVEL) fail(`level ${raw.level}, expected ${SUBTREE_LEVEL}`);
    // 2.
    if (raw.tree_id !== treeId) fail(`tree ${raw.tree_id}, asked for ${treeId}`);
    if (raw.start !== start) fail(`start ${raw.start}, asked for ${start}`);
    // 3.
    if (!isU32(raw.tree_leaves) || raw.tree_leaves > LEAVES_PER_TREE) {
        fail(`tree_leaves ${raw.tree_leaves} is not a tree's size`);
    }
    if (typeof raw.sealed !== 'boolean') fail('sealed is not a boolean');
    // 4.
    if (!Array.isArray(raw.roots)) fail('roots is not an array');
    const blocksLeft = Math.max(0, Math.ceil(raw.tree_leaves / LEAVES_PER_BLOCK) - start);
    const limit = Math.min(count, MAX_SUBTREE_ROOTS_PER_CALL, blocksLeft);
    if (raw.roots.length > limit) fail(`${raw.roots.length} roots, at most ${limit} possible`);
    // 5.
    raw.roots.forEach((root, i) => {
        if (!isCanonicalHex32(root)) fail(`roots[${i}] is not a canonical 32-byte field element`);
    });
    if (!isCanonicalHex32(raw.root)) fail('root is not a canonical 32-byte field element');

    return {
        treeId: raw.tree_id,
        level: raw.level,
        treeLeaves: raw.tree_leaves,
        sealed: raw.sealed,
        root: raw.root,
        start: raw.start,
        roots: raw.roots,
    };
}
