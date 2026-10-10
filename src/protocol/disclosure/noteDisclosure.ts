/**
 * Proving what ONE note holds, without granting any power to spend it.
 *
 * A disclosure key is a shareable string carrying the plaintext preimage of a
 * single commitment: `orbdisc:<base64url(JSON)>`. The holder can verify the
 * note's value and asset and nothing else.
 *
 * | Revealed | Withheld |
 * | --- | --- |
 * | value, assetId, blinding | spendingKey, nullifier, viewing secret key |
 * | ownerPk (a BJJ Ax, not an EVM address) | every other note of the same wallet |
 *
 * The commitment check on decode is a proof-of-knowledge of the preimage:
 * Poseidon4 is recomputed and compared, so a forged or edited key fails rather
 * than decoding into a lie. `null` is returned for every failure — malformed,
 * wrong version, out of range, bad preimage — because a caller showing a
 * disclosure to a user has one decision to make, not three.
 *
 * Every field is range-checked before hashing. Poseidon reduces its inputs mod
 * the BN254 field, so `value + r` hashes like `value`: without the bounds, the
 * holder of a 1-planck note could "disclose" ~2^254 against the same commitment.
 *
 * What it proves is knowledge of the preimage, NOT ownership: the sender of a
 * note knows the same preimage and can produce the same key.
 *
 * This is a public capability: an auditor, an exchange, or a quest verifier can
 * confirm a note's value from an `orbdisc:` key without any spend power. Note
 * CONSTRUCTION and opening (which do need the spending key) are custody and live
 * in the wallet — only this share/verify pair is here.
 *
 * Encoding goes through the SDK's own base64url rather than `btoa`/`atob`:
 * neither exists in React Native, and a key the official mobile wallet cannot
 * produce or read is not a shareable format.
 */

import { poseidon4 } from 'poseidon-lite';
import { base64UrlEncode, base64UrlDecode } from '../../foundation/encoding/base64url';
import { BN254_R } from '../../foundation/crypto/constants';

const PREFIX = 'orbdisc:';
const VERSION = 1;

/** Pallet types: `value` is a u128, `assetId` a u32. */
const U128_MAX = (1n << 128n) - 1n;
const U32_MAX = 0xffff_ffffn;

/** 0x-prefixed hex, at most 256 bits — no sign, no decimal, no unbounded input. */
const HEX_FIELD = /^0x[0-9a-fA-F]{1,64}$/;

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * The preimage fields a disclosure key carries. A subset of a note's fields —
 * exactly the ones that reveal value without revealing spend power. Typed as its
 * own shape (not the full note) so a caller can build a disclosure without ever
 * holding a spending key.
 */
export interface NoteDisclosureInput {
    /** Poseidon4(value, assetId, ownerPk, blinding) — matches the on-chain commitment. */
    commitment: bigint;
    /** Note value in the smallest unit. */
    value: bigint;
    /** Asset ID as registered in the shielded pool. */
    assetId: bigint;
    /** BabyJubJub Ax coordinate of the note owner. */
    ownerPk: bigint;
    /** Random blinding scalar chosen at note creation. */
    blinding: bigint;
}

/**
 * Decoded and cryptographically verified contents of a note disclosure key.
 *
 * The `commitment` field is guaranteed to equal Poseidon4(value, assetId, ownerPk, blinding)
 * — this is verified by decodeNoteDisclosureKey before returning.
 */
export type NoteDisclosure = NoteDisclosureInput;

// ─── Internal payload shape ───────────────────────────────────────────────────

interface DisclosurePayload {
    v: number;
    c: string; // commitment (hex)
    val: string; // value (hex)
    aid: string; // assetId (hex)
    opk: string; // ownerPk (hex)
    bld: string; // blinding (hex)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toHex(n: bigint): string {
    return '0x' + n.toString(16);
}

function fromHex(s: unknown): bigint | null {
    return typeof s === 'string' && HEX_FIELD.test(s) ? BigInt(s) : null;
}

/** The first field outside its canonical range, or null when all are in range. */
function outOfRangeField(note: NoteDisclosureInput): string | null {
    const inField = (n: bigint) => n >= 0n && n < BN254_R;
    if (note.value < 0n || note.value > U128_MAX) return 'value';
    if (note.assetId < 0n || note.assetId > U32_MAX) return 'assetId';
    if (!inField(note.ownerPk)) return 'ownerPk';
    if (!inField(note.blinding)) return 'blinding';
    if (!inField(note.commitment)) return 'commitment';
    return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Encodes a note's plaintext preimage into a shareable disclosure key.
 *
 * The key does NOT include the spendingKey or nullifier. It is safe to share
 * with any party that should be able to verify the note's value and asset
 * without being able to spend it.
 *
 * @param note  The disclosure preimage (a subset of a note's fields).
 * @returns     A "orbdisc:…" string suitable for copy-paste or QR encoding.
 * @throws RangeError when `value` is not a u128, `assetId` not a u32, or
 *         `ownerPk`, `blinding` or `commitment` not in `[0, BN254_R)`.
 */
export function createNoteDisclosureKey(note: NoteDisclosureInput): string {
    const field = outOfRangeField(note);
    if (field) throw new RangeError(`NoteDisclosure: ${field} out of range`);
    const payload: DisclosurePayload = {
        v: VERSION,
        c: toHex(note.commitment),
        val: toHex(note.value),
        aid: toHex(note.assetId),
        opk: toHex(note.ownerPk),
        bld: toHex(note.blinding),
    };
    return PREFIX + base64UrlEncode(JSON.stringify(payload));
}

/**
 * Decodes and cryptographically verifies a note disclosure key.
 *
 * Verification: recomputes Poseidon4(value, assetId, ownerPk, blinding) and
 * asserts it equals the embedded commitment, after checking every field is in
 * its canonical range. This ensures the preimage is consistent and cannot be
 * tampered with.
 *
 * @param key  A "orbdisc:…" string produced by createNoteDisclosureKey.
 * @returns    The verified NoteDisclosure, or null if the key is malformed,
 *             has an unknown version, carries an out-of-range field, or fails
 *             Poseidon4 verification.
 */
export function decodeNoteDisclosureKey(key: string): NoteDisclosure | null {
    try {
        if (!key.startsWith(PREFIX)) return null;
        const payload = JSON.parse(base64UrlDecode(key.slice(PREFIX.length))) as DisclosurePayload;
        if (payload.v !== VERSION) return null;

        const commitment = fromHex(payload.c);
        const value = fromHex(payload.val);
        const assetId = fromHex(payload.aid);
        const ownerPk = fromHex(payload.opk);
        const blinding = fromHex(payload.bld);
        if (
            commitment === null ||
            value === null ||
            assetId === null ||
            ownerPk === null ||
            blinding === null
        ) {
            return null;
        }
        const disclosure: NoteDisclosure = { commitment, value, assetId, ownerPk, blinding };
        if (outOfRangeField(disclosure)) return null;

        // Cryptographic preimage verification
        const recomputed = poseidon4([
            disclosure.value,
            disclosure.assetId,
            disclosure.ownerPk,
            disclosure.blinding,
        ]);
        if (recomputed !== disclosure.commitment) return null;

        return disclosure;
    } catch {
        return null;
    }
}
