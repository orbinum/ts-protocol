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
 */
import { BABYJUB_SUBORDER } from '../../foundation/crypto/constants';

const NONCE_SIZE = 12;
const CIPHERTEXT_SIZE = 136;
const EPH_PK_SIZE = 32;

/** Total size of an on-chain encrypted memo, in bytes. */
export const ENCRYPTED_MEMO_SIZE = NONCE_SIZE + CIPHERTEXT_SIZE + EPH_PK_SIZE; // 180

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

    /** A 180-byte zeroed dummy memo (no information, always valid on-chain). */
    dummy(): Uint8Array {
        return new Uint8Array(ENCRYPTED_MEMO_SIZE);
    },
} as const;
