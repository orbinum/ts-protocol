/**
 * The public shape of an encrypted note memo — its size, and the boundary
 * checks a caller runs before a memo reaches the chain.
 *
 * A memo's 180-byte layout is normative wire format: the chain stores it as an
 * opaque blob, so this file, not the runtime, defines how big it is and what
 * counts as well-formed. None of this opens a memo or derives a key — sealing
 * a note and opening one are custody, and live in the wallet, not here.
 *
 *   layout: nonce(12) || ciphertext+MAC(136) || ephPk(32) = 180
 *
 * The nonce is public. Its first bytes carry the memo FORMAT, which the chain
 * enforces from `ShieldedPool.TaggedMemosFrom` on:
 *
 *   nonce[0]      view tag (opaque to the chain)
 *   nonce[1]      format: MEMO_FORMAT_TAGGED or MEMO_FORMAT_HANDSHAKE
 *   nonce[2..10]  detection tag (opaque to the chain)
 *
 * HANDSHAKE: found by trial ECDH. TAGGED: found by its owner without one, so a
 * wallet skips the ECDH for every TAGGED leaf from `TaggedMemosFromLeaf` on that
 * is not its own. How a tag is derived is custody and lives in the wallet.
 */
import { BABYJUB_SUBORDER } from '../../foundation/crypto/constants';

const NONCE_SIZE = 12;
const CIPHERTEXT_SIZE = 136;
const EPH_PK_SIZE = 32;

/** Total size of an on-chain encrypted memo, in bytes. */
export const ENCRYPTED_MEMO_SIZE = NONCE_SIZE + CIPHERTEXT_SIZE + EPH_PK_SIZE; // 180

// The format byte and its values mirror the pallet (`pallet-shielded-pool`,
// `types/memo.rs`: `MEMO_FORMAT_BYTE_INDEX`, `MEMO_FORMAT_TAGGED`,
// `MEMO_FORMAT_HANDSHAKE`); a test pins them, so change both or neither.

/** Offset of the format byte in a memo (inside the public nonce). */
export const MEMO_FORMAT_OFFSET = 1;
/** Offset and size of the detection tag in a memo (inside the public nonce, after the format byte). */
export const MEMO_TAG_OFFSET = 2;
export const MEMO_TAG_SIZE = 8;
/** Found by its owner without trial ECDH. */
export const MEMO_FORMAT_TAGGED = 0x01;
/** Found by trial ECDH. */
export const MEMO_FORMAT_HANDSHAKE = 0x02;

/** A format byte the chain accepts. */
export type MemoFormatByte = typeof MEMO_FORMAT_TAGGED | typeof MEMO_FORMAT_HANDSHAKE;

/**
 * A memo's format byte when it is one the chain accepts, else null: a legacy memo
 * (any other byte), or anything that is not a full 180-byte memo, as the pallet's
 * `EncryptedMemo::format` reads it.
 */
export function memoFormatOf(memo: Uint8Array): MemoFormatByte | null {
    if (!(memo instanceof Uint8Array) || memo.length !== ENCRYPTED_MEMO_SIZE) return null;
    const format = memo[MEMO_FORMAT_OFFSET];
    return format === MEMO_FORMAT_TAGGED || format === MEMO_FORMAT_HANDSHAKE ? format : null;
}

/**
 * Reduce 32 bytes to a usable BabyJubJub scalar.
 *
 * Length is checked, not tolerated. The reduction below turns ANY input into a
 * usable scalar — a 16-byte key, or all zeros, silently becomes `1n` — so a
 * truncated or uninitialised buffer would produce a valid scalar some other
 * wallet could also reach. An empty array is worse: `BigInt('0x')` throws from
 * whichever primitive touched it first.
 */
export function bytesToBjjScalar(bytes: Uint8Array): bigint {
    if (bytes.length !== 32) {
        throw new Error(`bytesToBjjScalar: expected 32 bytes, got ${bytes.length}`);
    }
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return BigInt('0x' + hex) % BABYJUB_SUBORDER || 1n;
}

/**
 * Boundary checks over a memo blob — size and a zeroed placeholder. These read
 * or shape the envelope; they never open it.
 */
export const MemoFormat = {
    /**
     * Validates that `bytes` is a properly-sized encrypted memo.
     * Throws if the length is not ENCRYPTED_MEMO_SIZE (180 bytes).
     *
     * Call this at system boundaries (extrinsic builders, precompile encoders)
     * to catch malformed memos before they reach the chain and fail on-chain.
     */
    validate(bytes: Uint8Array, context?: string): void {
        if (bytes.length !== ENCRYPTED_MEMO_SIZE) {
            const ctx = context ? ` (${context})` : '';
            throw new Error(
                `EncryptedMemo: invalid size${ctx} — expected ${ENCRYPTED_MEMO_SIZE} bytes, got ${bytes.length}`
            );
        }
    },

    /**
     * A 180-byte dummy memo (no information): zeros but the TAGGED format byte,
     * so the chain accepts it once the format is enforced and scanners skip it.
     */
    dummy(): Uint8Array {
        const memo = new Uint8Array(ENCRYPTED_MEMO_SIZE);
        memo[MEMO_FORMAT_OFFSET] = MEMO_FORMAT_TAGGED;
        return memo;
    },
} as const;
