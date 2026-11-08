/**
 * The key a payment verifier holds, and the `orbview1:` string a recipient
 * exports it as: `orbview1:{viewingSecretKey hex}:{ownerPk hex}:{checksum}`.
 *
 * It reads every payment sent to that address — amount, asset, the sender's
 * declared name or address — and cannot spend, or tell a spent note from an
 * unspent one (both need the spending key). Treat it like a read-only API
 * secret. The checksum is a typo guard, not authentication.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { fromHex, isHexOfLength, scalarToHex, toHex } from '../../../foundation/encoding/hex';
import { ownerPkPoint } from '../owner';

export const VIEWING_KEY_SCHEME = 'orbview1:';
/** Longer than any `orbview1:` string; refused before parsing. */
const MAX_VIEWING_KEY_CHARS = 200;

/** What a payment verifier needs: the recipient's viewing secret key and owner key. */
export interface PaymentViewingKey {
    /** 32-byte viewing secret key (ivsk). */
    viewingSecretKey: Uint8Array;
    /** The recipient's owner key (BabyJubJub Ax); public, it is in their `orbpriv3` address. */
    ownerPk: bigint;
}

/**
 * The owner key's point, or throws: a key that cannot be one is a wiring bug
 * (a truncated or zeroed buffer, a swapped field), not a slip to refuse —
 * answering "not yours" to every slip would hide it.
 */
export function usableViewingKey(key: PaymentViewingKey): [bigint, bigint] {
    const secret = key?.viewingSecretKey;
    if (!(secret instanceof Uint8Array) || secret.length !== 32 || secret.every((b) => b === 0)) {
        throw new TypeError('viewing key: the viewing secret key must be 32 non-zero bytes');
    }
    const point = ownerPkPoint(key.ownerPk);
    if (!point) throw new TypeError('viewing key: ownerPk is not a usable owner key');
    return point;
}

const checksumOf = (body: string) =>
    toHex(sha256(new TextEncoder().encode(body)).slice(0, 4)).slice(2);

export function encodeViewingKey(key: PaymentViewingKey): string {
    usableViewingKey(key);
    const body = `${VIEWING_KEY_SCHEME}${toHex(key.viewingSecretKey)}:${scalarToHex(key.ownerPk)}`;
    return `${body}:${checksumOf(body)}`;
}

/** The key in an `orbview1:` string, or null when it is malformed, mistyped or unusable. */
export function decodeViewingKey(text: string): PaymentViewingKey | null {
    if (typeof text !== 'string' || text.length > MAX_VIEWING_KEY_CHARS) return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith(VIEWING_KEY_SCHEME)) return null;
    const parts = trimmed.slice(VIEWING_KEY_SCHEME.length).split(':');
    if (parts.length !== 3) return null;
    const [ivskHex, ownerPkHex, checksum] = parts as [string, string, string];
    if (!isHexOfLength(ivskHex, 32) || !isHexOfLength(ownerPkHex, 32)) return null;
    if (checksumOf(`${VIEWING_KEY_SCHEME}${ivskHex}:${ownerPkHex}`) !== checksum) return null;
    const key = { viewingSecretKey: fromHex(ivskHex), ownerPk: BigInt(ownerPkHex) };
    try {
        usableViewingKey(key);
    } catch {
        return null;
    }
    return key;
}
