/**
 * Opening a note's memo with the recipient's viewing key.
 *
 * Layout (180 bytes): nonce(12) || ciphertext+MAC(136) || ephPk(32). The
 * encryption key mixes in the note's commitment, so a memo lifted onto another
 * note fails to open instead of decrypting to the wrong values.
 */
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { BN254_R } from '../../../foundation/crypto/constants';
import { fastMulPoint } from '../../../foundation/crypto/bjj-fast';
import { unpackUsableViewingKey } from '../../../foundation/crypto/bjj';
import { bigintTo32Le, bytesToBigintLE } from '../../../foundation/encoding/bytes';
import { bytesToBjjScalar, ENCRYPTED_MEMO_SIZE } from '../../memo/memoFormat';

const NONCE_SIZE = 12;
const CIPHERTEXT_SIZE = 136; // plaintext(120) + MAC(16)
const COMMITMENT_SIZE = 32;
const KEY_DOMAIN = new TextEncoder().encode('orbinum-note-encryption-v1');
const VIEW_TAG_DOMAIN = new TextEncoder().encode('orbinum-view-tag-v1');
/** Circuit versions a memo may name; 0 is "unset" and refused. */
const MAX_MEMO_CIRCUIT_VERSION = 0xffff;

/** The memo's 120-byte plaintext, parsed. */
export interface MemoPlaintext {
    value: bigint;
    ownerPk: bigint;
    blinding: bigint;
    assetId: bigint;
    sourcePk: bigint;
    circuitVersion: number;
}

/**
 * `[ivsk]·ephPk` (x, 32 bytes LE), or null for a memo of the wrong size or an
 * ephemeral key outside the prime subgroup — a small-order key would make the
 * "shared" secret one of at most 8 values anyone can try. An all-zero
 * ephemeral key is the public-memo convention: the shared secret is zero, and
 * anyone can read that memo.
 */
export function memoSharedSecret(
    memo: Uint8Array,
    viewingSecretKey: Uint8Array
): Uint8Array | null {
    if (memo.length !== ENCRYPTED_MEMO_SIZE) return null;
    const ephPk = bytesToBigintLE(memo.subarray(NONCE_SIZE + CIPHERTEXT_SIZE));
    if (ephPk === 0n) return new Uint8Array(32);
    const point = unpackUsableViewingKey(ephPk);
    if (!point) return null;
    return bigintTo32Le(fastMulPoint(point, bytesToBjjScalar(viewingSecretKey))[0]);
}

/** Whether the memo's first nonce byte is the view tag of `sharedSecret`. */
export function memoViewTagMatches(memo: Uint8Array, sharedSecret: Uint8Array): boolean {
    if (memo.length !== ENCRYPTED_MEMO_SIZE) return false;
    const h = sha256.create();
    h.update(VIEW_TAG_DOMAIN);
    h.update(sharedSecret);
    return memo[0] === h.digest()[0];
}

/**
 * The plaintext of `memo` bound to `commitment`, or null: wrong sizes, a wrong
 * key, a bad MAC, non-canonical field elements (Poseidon reduces mod r, so
 * `x + r` would open the same commitment as `x`) or an unsupported circuit
 * version. Never throws.
 */
export function openMemo(
    memo: Uint8Array,
    commitment: Uint8Array,
    sharedSecret: Uint8Array
): MemoPlaintext | null {
    if (memo.length !== ENCRYPTED_MEMO_SIZE || commitment.length !== COMMITMENT_SIZE) return null;
    if (sharedSecret.length !== 32) return null;
    const keyHash = sha256.create();
    keyHash.update(sharedSecret);
    keyHash.update(commitment);
    keyHash.update(KEY_DOMAIN);
    let plaintext: Uint8Array;
    try {
        plaintext = chacha20poly1305(keyHash.digest(), memo.slice(0, NONCE_SIZE)).decrypt(
            memo.slice(NONCE_SIZE, NONCE_SIZE + CIPHERTEXT_SIZE)
        );
    } catch {
        return null;
    }
    const view = new DataView(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength);
    const value = view.getBigUint64(0, true) | (view.getBigUint64(8, true) << 64n);
    const ownerPk = bytesToBigintLE(plaintext.subarray(16, 48));
    const blinding = bytesToBigintLE(plaintext.subarray(48, 80));
    const assetId = BigInt(view.getUint32(80, true));
    const sourcePk = bytesToBigintLE(plaintext.subarray(84, 116));
    const circuitVersion = view.getUint32(116, true);
    if (ownerPk >= BN254_R || blinding >= BN254_R) return null;
    if (circuitVersion === 0 || circuitVersion > MAX_MEMO_CIRCUIT_VERSION) return null;
    return { value, ownerPk, blinding, assetId, sourcePk, circuitVersion };
}
