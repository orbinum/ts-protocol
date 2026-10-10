/**
 * Merkle paths built by the wallet itself, from data that cannot reveal which
 * note it is about to spend.
 *
 * A path has two halves:
 *
 *   - Levels 0..5 come from the 64 leaves of the note's block, which the wallet
 *     kept while scanning.
 *   - Levels 6..19 come from the tree's level-6 subtree roots, which every
 *     wallet downloads alike (`privacy_getSubtreeRoots`).
 *
 * Every subtree whose leaves are all final never changes, so its root is
 * computed once and remembered (`memo`). Only the right edge of the active
 * tree is recomputed per spend.
 *
 * The hash and the empty-subtree ladder are the pallet's exactly: circom
 * Poseidon(2) over BN254 field elements, `zero[0] = 0`,
 * `zero[l] = H(zero[l-1], zero[l-1])`.
 */
import { poseidon2 } from 'poseidon-lite';
import { BN254_R } from '../../foundation/crypto/constants';
import { LEAVES_PER_TREE, isValidLeafIndex } from '../spend/treeIndex';

/** Levels of a tree's path (the circuit's depth). */
export const MERKLE_DEPTH = 20;

/** Level of the subtree roots the node serves: each covers one block. */
export const SUBTREE_LEVEL = 6;

/** Leaves under one level-{@link SUBTREE_LEVEL} subtree root. */
export const LEAVES_PER_BLOCK = 1 << SUBTREE_LEVEL;

/** Blocks in one tree: the most subtree roots a tree can have. */
export const BLOCKS_PER_TREE = LEAVES_PER_TREE / LEAVES_PER_BLOCK;

/**
 * Throws unless `value` is a canonical BN254 field element. A value past `r`
 * would be reduced inside Poseidon and silently name a different leaf or root.
 */
function assertField(value: bigint, what: string): void {
    if (typeof value !== 'bigint' || value < 0n || value >= BN254_R) {
        throw new RangeError(`${what} is not a canonical field element`);
    }
}

const ZEROS: readonly bigint[] = (() => {
    const z = [0n];
    for (let l = 1; l <= MERKLE_DEPTH; l++) z.push(poseidon2([z[l - 1]!, z[l - 1]!]));
    return z;
})();

/** Root of an empty subtree of height `level`. */
export function zeroHash(level: number): bigint {
    const z = ZEROS[level];
    if (z === undefined) throw new RangeError(`no zero hash for level ${level}`);
    return z;
}

/** The pallet's node hash: `H(left, right)`. */
export const hashPair = (left: bigint, right: bigint): bigint => poseidon2([left, right]);

/**
 * The lower siblings of the leaf at `offset` in its block, and the block's
 * root. Missing leaves (past the last one inserted) are empty.
 */
export function blockPath(
    blockLeaves: readonly bigint[],
    offset: number
): { siblings: bigint[]; root: bigint } {
    if (blockLeaves.length > LEAVES_PER_BLOCK) throw new RangeError('a block holds 64 leaves');
    if (!Number.isInteger(offset) || offset < 0 || offset >= LEAVES_PER_BLOCK) {
        throw new RangeError(`offset ${offset} is outside a block`);
    }
    blockLeaves.forEach((leaf, i) => assertField(leaf, `leaf ${i}`));
    let layer = Array.from({ length: LEAVES_PER_BLOCK }, (_, i) => blockLeaves[i] ?? ZEROS[0]!);
    const siblings: bigint[] = [];
    for (let level = 0; level < SUBTREE_LEVEL; level++) {
        siblings.push(layer[(offset >> level) ^ 1]!);
        const next: bigint[] = [];
        for (let i = 0; i < layer.length; i += 2) next.push(hashPair(layer[i]!, layer[i + 1]!));
        layer = next;
    }
    return { siblings, root: layer[0]! };
}

/**
 * The upper levels of one tree, over its level-6 subtree roots.
 *
 * `roots[i]` is block `i`'s root. The first `finalCount` are final (their
 * blocks are full); the rest, at most the last, may still change. Past the
 * last root every node is empty.
 */
export class SubtreeRootTree {
    /**
     * @param memo Roots of subtrees made only of final blocks, keyed
     *   `level:index`. Shared across snapshots of the same tree: entries never
     *   go stale.
     */
    constructor(
        private readonly roots: readonly bigint[],
        private readonly finalCount: number,
        private readonly memo: Map<string, bigint> = new Map()
    ) {
        if (roots.length > BLOCKS_PER_TREE) {
            throw new RangeError(`a tree has at most ${BLOCKS_PER_TREE} blocks`);
        }
        if (!Number.isInteger(finalCount) || finalCount < 0 || finalCount > roots.length) {
            throw new RangeError('finalCount must be within the roots');
        }
        roots.forEach((root, i) => assertField(root, `subtree root ${i}`));
    }

    /** Number of blocks the tree holds (its served subtree roots). */
    get blocks(): number {
        return this.roots.length;
    }

    /** The node at `level` (>= 6) and `index`. */
    node(level: number, index: number): bigint {
        if (level < SUBTREE_LEVEL || level > MERKLE_DEPTH) throw new RangeError(`level ${level}`);
        const span = 2 ** (level - SUBTREE_LEVEL);
        const first = index * span;
        if (first >= this.roots.length) return zeroHash(level);
        if (level === SUBTREE_LEVEL) return this.roots[index]!;
        const final = first + span <= this.finalCount;
        const key = `${level}:${index}`;
        if (final) {
            const hit = this.memo.get(key);
            if (hit !== undefined) return hit;
        }
        const value = hashPair(
            this.node(level - 1, 2 * index),
            this.node(level - 1, 2 * index + 1)
        );
        if (final) this.memo.set(key, value);
        return value;
    }

    /** The siblings of block `block` at levels 6..19. */
    siblings(block: number): bigint[] {
        const out: bigint[] = [];
        for (let level = SUBTREE_LEVEL; level < MERKLE_DEPTH; level++) {
            out.push(this.node(level, (block >> (level - SUBTREE_LEVEL)) ^ 1));
        }
        return out;
    }

    /** The tree's root. */
    root(): bigint {
        return this.node(MERKLE_DEPTH, 0);
    }
}

/** Why a locally built path was refused: the caller falls back to the node. */
export class LocalPathMismatchError extends Error {
    constructor(readonly reason: 'block-root' | 'tree-root' | 'leaf-absent') {
        super(`local Merkle path refused: ${reason}`);
        this.name = 'LocalPathMismatchError';
    }
}

/**
 * The path of the leaf at global `leafIndex`, built locally:
 *
 * 1. the leaf must sit at its offset in `blockLeaves` (the block's leaves from
 *    its first, as far as known);
 * 2. those leaves must hash to the tree's root for that block;
 * 3. the whole tree must fold to `anchorRoot`, the root the node served with
 *    the subtree roots.
 *
 * Any mismatch (a block that grew since it was kept, a tree that moved, data
 * tampered with) throws {@link LocalPathMismatchError}; malformed input throws
 * `RangeError`. A path that passes is what the chain accepts for that root.
 */
export function buildLocalPath(params: {
    leafIndex: number;
    leaf: bigint;
    blockLeaves: readonly bigint[];
    tree: SubtreeRootTree;
    anchorRoot: bigint;
}): bigint[] {
    if (!isValidLeafIndex(params.leafIndex)) throw new RangeError(`leaf index ${params.leafIndex}`);
    assertField(params.leaf, 'leaf');
    assertField(params.anchorRoot, 'anchor root');
    const local = params.leafIndex % LEAVES_PER_TREE;
    const block = Math.floor(local / LEAVES_PER_BLOCK);
    const offset = local % LEAVES_PER_BLOCK;
    // 1.
    if (params.blockLeaves[offset] !== params.leaf) throw new LocalPathMismatchError('leaf-absent');
    // 2.
    const lower = blockPath(params.blockLeaves, offset);
    if (block >= params.tree.blocks || params.tree.node(SUBTREE_LEVEL, block) !== lower.root) {
        throw new LocalPathMismatchError('block-root');
    }
    // 3.
    if (params.tree.root() !== params.anchorRoot) throw new LocalPathMismatchError('tree-root');
    return [...lower.siblings, ...params.tree.siblings(block)];
}

/** Whether `path` takes `leaf` at `leafIndex` to `root`. */
export function verifyPath(
    leaf: bigint,
    leafIndex: number,
    path: readonly bigint[],
    root: bigint
): boolean {
    if (path.length !== MERKLE_DEPTH || !isValidLeafIndex(leafIndex)) return false;
    const local = leafIndex % LEAVES_PER_TREE;
    let cur = leaf;
    for (let level = 0; level < MERKLE_DEPTH; level++) {
        cur = (local >> level) & 1 ? hashPair(path[level]!, cur) : hashPair(cur, path[level]!);
    }
    return cur === root;
}
