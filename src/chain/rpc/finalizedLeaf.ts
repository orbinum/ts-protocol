/**
 * Where a commitment sits in the FINALIZED chain: `ShieldedPool.CommitmentToLeafIndex`
 * read with `state_getStorage` at the finalized head.
 *
 * `privacy_getMerkleProofByCommitment` answers from the node's best block,
 * which a reorganisation can still replace. A payment confirmed there can
 * vanish with its block — and the payer can spend the same notes again. Reading
 * the storage map at a finalized hash answers "is it in a block that will never
 * be reverted?" with no node change.
 *
 * The key is built here rather than from runtime metadata: the prefix is fixed
 * (`twox128("ShieldedPool") ++ twox128("CommitmentToLeafIndex")`, pinned by a
 * test against xxhash), and the map hashes its key with `Blake2_128Concat` over
 * the commitment's 32 raw bytes.
 */
import { blake2b } from '@noble/hashes/blake2.js';
import { fromHex, isHexOfLength, toHex } from '../../foundation/encoding/hex';

/** `twox128("ShieldedPool") ++ twox128("CommitmentToLeafIndex")`. */
export const COMMITMENT_TO_LEAF_INDEX_PREFIX =
    '0xb274d9f3b776186eb4f55eaff023eb59ee4f8a28375f73fc90eb82ccf05956ac';

/**
 * The storage key of `commitmentHex` in `ShieldedPool.CommitmentToLeafIndex`.
 * Throws a TypeError on anything but a 32-byte hex commitment.
 */
export function commitmentLeafIndexKey(commitmentHex: string): string {
    if (!isHexOfLength(commitmentHex, 32)) {
        throw new TypeError('commitmentLeafIndexKey: commitment must be 32-byte hex');
    }
    const commitment = fromHex(commitmentHex);
    const key = new Uint8Array(32 + 16 + 32);
    key.set(fromHex(COMMITMENT_TO_LEAF_INDEX_PREFIX), 0);
    key.set(blake2b(commitment, { dkLen: 16 }), 32);
    key.set(commitment, 48);
    return toHex(key);
}

/**
 * The leaf index a `state_getStorage` answer holds (a SCALE `u32`, 4 bytes LE),
 * null for an absent entry. Throws on anything else: a node answering nonsense
 * must never read as "not paid".
 */
export function decodeLeafIndex(raw: unknown): number | null {
    if (raw === null) return null;
    if (!isHexOfLength(raw, 4)) {
        throw new Error('finalized lookup: the node returned a malformed leaf index');
    }
    return new DataView(fromHex(raw).buffer).getUint32(0, true);
}
