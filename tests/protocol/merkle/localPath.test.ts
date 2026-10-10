import { describe, it, expect } from 'vitest';
import { poseidon2 } from 'poseidon-lite';
import {
    MERKLE_DEPTH,
    LEAVES_PER_BLOCK,
    BLOCKS_PER_TREE,
    zeroHash,
    hashPair,
    blockPath,
    SubtreeRootTree,
    LocalPathMismatchError,
    buildLocalPath,
    verifyPath,
} from '../../../src/protocol/merkle/localPath';
import { LEAVES_PER_TREE } from '../../../src/protocol/spend/treeIndex';

/** An independent reference: the whole tree level by level, as the pallet's frontier builds it. */
function referenceTree(leaves: bigint[]) {
    const layers: bigint[][] = [leaves.slice()];
    for (let l = 0; l < MERKLE_DEPTH; l++) {
        const cur = layers[l]!;
        const next: bigint[] = [];
        for (let i = 0; i < cur.length; i += 2)
            next.push(hashPair(cur[i]!, cur[i + 1] ?? zeroHash(l)));
        layers.push(next);
    }
    const root = layers[MERKLE_DEPTH]![0] ?? zeroHash(MERKLE_DEPTH);
    const path = (local: number) =>
        Array.from({ length: MERKLE_DEPTH }, (_, l) => layers[l]![(local >> l) ^ 1] ?? zeroHash(l));
    return { root, path };
}

/** What a wallet would hold: the block roots and the leaves of one block. */
function served(leaves: bigint[]) {
    const blocks = Math.ceil(leaves.length / LEAVES_PER_BLOCK);
    const roots = Array.from(
        { length: blocks },
        (_, b) => blockPath(leaves.slice(b * LEAVES_PER_BLOCK, (b + 1) * LEAVES_PER_BLOCK), 0).root
    );
    const finalCount = Math.floor(leaves.length / LEAVES_PER_BLOCK);
    return { roots, finalCount };
}

const blockOf = (leaves: bigint[], local: number) => {
    const b = Math.floor(local / LEAVES_PER_BLOCK) * LEAVES_PER_BLOCK;
    return leaves.slice(b, b + LEAVES_PER_BLOCK);
};

const leavesOf = (n: number, seed = 1n) =>
    Array.from({ length: n }, (_, i) => poseidon2([seed, BigInt(i)]));

describe('the pallet hash and empty subtrees', () => {
    it('is circom Poseidon(2), with the pallet known answer', () => {
        // primitives/zk-core/tests/poseidon_vectors.rs
        expect(hashPair(1n, 2n)).toBe(
            7853200120776062878684798364095072458815029376092732009249414926327459813530n
        );
    });

    it('builds the zero ladder from zero[0] = 0', () => {
        expect(zeroHash(0)).toBe(0n);
        for (let l = 1; l <= MERKLE_DEPTH; l++)
            expect(zeroHash(l)).toBe(hashPair(zeroHash(l - 1), zeroHash(l - 1)));
        expect(() => zeroHash(21)).toThrow(RangeError);
    });
});

describe('buildLocalPath', () => {
    for (const n of [1, 63, 64, 65, 200, 1000]) {
        it(`equals the reference path for every leaf of a ${n}-leaf tree`, () => {
            const leaves = leavesOf(n);
            const ref = referenceTree(leaves);
            const { roots, finalCount } = served(leaves);
            const tree = new SubtreeRootTree(roots, finalCount);
            expect(tree.root()).toBe(ref.root);
            const step = n > 200 ? 37 : 1;
            for (let local = 0; local < n; local += step) {
                const path = buildLocalPath({
                    leafIndex: local,
                    leaf: leaves[local]!,
                    blockLeaves: blockOf(leaves, local),
                    tree,
                    anchorRoot: ref.root,
                });
                expect(path).toEqual(ref.path(local));
                expect(verifyPath(leaves[local]!, local, path, ref.root)).toBe(true);
            }
        });
    }

    it('uses the tree-local index in a later tree', () => {
        const leaves = leavesOf(130);
        const ref = referenceTree(leaves);
        const { roots, finalCount } = served(leaves);
        const tree = new SubtreeRootTree(roots, finalCount);
        const local = 100;
        const path = buildLocalPath({
            leafIndex: 3 * LEAVES_PER_TREE + local,
            leaf: leaves[local]!,
            blockLeaves: blockOf(leaves, local),
            tree,
            anchorRoot: ref.root,
        });
        expect(path).toEqual(ref.path(local));
    });

    it('refuses a leaf not at its offset, a stale block, or a stale anchor', () => {
        const leaves = leavesOf(150);
        const ref = referenceTree(leaves);
        const { roots, finalCount } = served(leaves);
        const tree = new SubtreeRootTree(roots, finalCount);
        const base = {
            leafIndex: 140,
            blockLeaves: blockOf(leaves, 140),
            tree,
        };
        const reason = (f: () => unknown) => {
            try {
                f();
            } catch (e) {
                return (e as LocalPathMismatchError).reason;
            }
            return null;
        };
        expect(reason(() => buildLocalPath({ ...base, leaf: 7n, anchorRoot: ref.root }))).toBe(
            'leaf-absent'
        );
        // The block kept while scanning is missing leaves that landed since.
        const stale = blockOf(leaves, 140).slice(0, 13);
        expect(
            reason(() =>
                buildLocalPath({
                    ...base,
                    blockLeaves: stale,
                    leaf: leaves[140]!,
                    anchorRoot: ref.root,
                })
            )
        ).toBe('block-root');
        expect(
            reason(() => buildLocalPath({ ...base, leaf: leaves[140]!, anchorRoot: ref.root + 1n }))
        ).toBe('tree-root');
    });
});

describe('SubtreeRootTree memo', () => {
    it('reuses final subtrees across snapshots of a growing tree, and stays exact', () => {
        const memo = new Map<string, bigint>();
        const all = leavesOf(64 * 9 + 5, 7n);
        let hashesFirst = 0;
        for (const n of [64 * 4 + 3, 64 * 6, 64 * 9 + 5]) {
            const leaves = all.slice(0, n);
            const { roots, finalCount } = served(leaves);
            const before = memo.size;
            const tree = new SubtreeRootTree(roots, finalCount, memo);
            expect(tree.root()).toBe(referenceTree(leaves).root);
            if (!hashesFirst) hashesFirst = memo.size - before;
        }
        expect(hashesFirst).toBeGreaterThan(0);
        // Only nodes made of final blocks are remembered.
        for (const key of memo.keys()) {
            const [level, index] = key.split(':').map(Number);
            expect((index! + 1) * 2 ** (level! - 6)).toBeLessThanOrEqual(9);
        }
    });

    it('never remembers a node that covers the changing last block', () => {
        const memo = new Map<string, bigint>();
        const a = leavesOf(64 * 2 + 10, 3n);
        const s1 = served(a);
        new SubtreeRootTree(s1.roots, s1.finalCount, memo).root();
        const b = [...a, ...leavesOf(20, 9n)];
        const s2 = served(b);
        expect(new SubtreeRootTree(s2.roots, s2.finalCount, memo).root()).toBe(
            referenceTree(b).root
        );
    });

    it('rejects a final count past the roots', () => {
        expect(() => new SubtreeRootTree([1n], 2)).toThrow(RangeError);
    });
});

describe('verifyPath', () => {
    it('rejects a wrong length or a wrong sibling', () => {
        const leaves = leavesOf(70);
        const ref = referenceTree(leaves);
        const path = ref.path(65);
        expect(verifyPath(leaves[65]!, 65, path.slice(0, 19), ref.root)).toBe(false);
        const bad = path.slice();
        bad[7] = bad[7]! + 1n;
        expect(verifyPath(leaves[65]!, 65, bad, ref.root)).toBe(false);
    });
});

// ─── Hostile input ─────────────────────────────────────────────────────────────
//
// Subtree roots come from an untrusted node and block leaves from an untrusted
// feed. Nothing they send may be reduced into a different value, grow memory
// past a tree's size, or turn into a path for another root.

const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

describe('hostile input', () => {
    const leaves = leavesOf(150);
    const ref = referenceTree(leaves);
    const { roots, finalCount } = served(leaves);
    const tree = new SubtreeRootTree(roots, finalCount);
    const base = {
        leafIndex: 70,
        leaf: leaves[70]!,
        blockLeaves: blockOf(leaves, 70),
        tree,
        anchorRoot: ref.root,
    };

    it('refuses a non-canonical leaf, block leaf, subtree root or anchor', () => {
        expect(() => buildLocalPath({ ...base, leaf: leaves[70]! + R })).toThrow(RangeError);
        const bad = blockOf(leaves, 70);
        bad[3] = R;
        expect(() => blockPath(bad, 0)).toThrow(RangeError);
        expect(() => new SubtreeRootTree([roots[0]!, R], 1)).toThrow(RangeError);
        expect(() => new SubtreeRootTree([-1n], 0)).toThrow(RangeError);
        expect(() => buildLocalPath({ ...base, anchorRoot: R + 1n })).toThrow(RangeError);
    });

    it('refuses more subtree roots than a tree has blocks', () => {
        expect(() => new SubtreeRootTree(new Array(BLOCKS_PER_TREE + 1).fill(0n), 0)).toThrow(
            RangeError
        );
        expect(() => new SubtreeRootTree(new Array(BLOCKS_PER_TREE).fill(0n), 0)).not.toThrow();
    });

    it('refuses a malformed leaf index or final count', () => {
        for (const leafIndex of [-1, 1.5, Number.NaN, 2 ** 32, Number.POSITIVE_INFINITY]) {
            expect(() => buildLocalPath({ ...base, leafIndex })).toThrow(RangeError);
            expect(verifyPath(leaves[70]!, leafIndex, ref.path(70), ref.root)).toBe(false);
        }
        expect(() => new SubtreeRootTree(roots, 1.5)).toThrow(RangeError);
    });

    it('refuses a leaf in a block the node did not serve', () => {
        const short = new SubtreeRootTree(roots.slice(0, 1), 1);
        expect(() => buildLocalPath({ ...base, tree: short })).toThrow(LocalPathMismatchError);
    });

    /**
     * A node that serves different "final" roots across two snapshots poisons
     * nothing: the memo keeps the first values, the tree no longer folds to the
     * second anchor, and the path is refused rather than built for a root the
     * chain never had.
     */
    it('a final root changed between snapshots fails closed', () => {
        const memo = new Map<string, bigint>();
        const first = served(leaves);
        new SubtreeRootTree(first.roots, first.finalCount, memo).root();
        const lying = [...first.roots];
        lying[0] = lying[0]! + 1n;
        const anchorForLie = new SubtreeRootTree(lying, first.finalCount).root();
        const again = new SubtreeRootTree(lying, first.finalCount, memo);
        expect(() =>
            buildLocalPath({
                ...base,
                leafIndex: 140,
                leaf: leaves[140]!,
                blockLeaves: blockOf(leaves, 140),
                tree: again,
                anchorRoot: anchorForLie,
            })
        ).toThrow(LocalPathMismatchError);
    });
});
