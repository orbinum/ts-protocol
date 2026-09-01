/**
 * Forest tree geometry — which tree a leaf falls in, and whether an index is real.
 *
 * Pure arithmetic over a leaf index. It grants no spend power and reveals
 * nothing secret: a `leafIndex` is public on chain, and everything here is the
 * same tree math the pallet applies. It lives in the public SDK because a
 * PaymentSlip (also public) validates a recipient's `leafIndex` with it, and a
 * host reasoning about tree boundaries needs one place to look.
 *
 * Note SELECTION — which notes pay an amount, coin selection — is a separate,
 * private concern and does not live here.
 */
/** Merkle tree depth for the transfer circuit (must match compile-time Transfer(20)). */
const TRANSFER_TREE_DEPTH = 20;

/**
 * Leaves one forest tree holds — the value this SDK assumes for the chain's
 * `MaxLeavesPerTree`.
 *
 * The pallet's `integrity_test` requires that constant to be a power of two no
 * greater than `2^MAX_TREE_DEPTH`, and forbids changing it on a live chain,
 * precisely because clients derive `tree_id` from a global leaf index with it.
 * It does NOT pin it to 2^20: a chain configured lower still passes, and this
 * constant would then place notes in the wrong tree.
 *
 * Exported so a host can reason about tree boundaries — and so a deployment on
 * a differently-configured chain has one place to look.
 */
export const LEAVES_PER_TREE = 1 << TRANSFER_TREE_DEPTH;

/**
 * Whether a leaf index is a real position in the forest.
 *
 * Leaf indexes are u32 on chain, and every one this library sees arrives from
 * an UNTRUSTED source — an indexer scan hint, or a note decoded from a memo. A
 * value outside that range is the source misbehaving, never a leaf the wallet
 * has not reached yet.
 *
 * One definition because the consequences differ per call site and all of them
 * are bad: `NaN` makes every same-tree comparison false (nothing is spendable),
 * and `Infinity` persisted as a scan cursor makes every later incremental scan
 * resume past the end of the tree (nothing is ever found again).
 */
export function isValidLeafIndex(leafIndex: number | null | undefined): leafIndex is number {
    return (
        leafIndex !== null &&
        leafIndex !== undefined &&
        Number.isSafeInteger(leafIndex) &&
        leafIndex >= 0 &&
        leafIndex < 2 ** 32
    );
}

/**
 * Forest tree a note belongs to.
 *
 * Falls back to tree 0 for a missing or malformed `leafIndex`. Both cases are
 * expected rather than defensive noise:
 *
 *   - Notes persisted before the forest upgrade carry no index, and they all
 *     predate the first seal, so tree 0 is the correct answer.
 *   - The index originates in an indexer scan hint, which is untrusted — see
 *     {@link isValidLeafIndex}.
 */
export function treeIdOf(note: { leafIndex?: number }): number {
    const idx = note.leafIndex;
    return isValidLeafIndex(idx) ? Math.floor(idx / LEAVES_PER_TREE) : 0;
}
