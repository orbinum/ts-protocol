/**
 * The recipient's public `orbpriv3:` address:
 * `orbpriv3:{ownerPk hex}:{packed viewing public key hex}:{checksum}`, the checksum
 * being the first 4 bytes of SHA-256 over everything before it.
 *
 * Public: a shop prints it on its checkout page. It lets a payer's proof be
 * checked (`verifyPaymentProof`) without any secret on the server. The checksum is
 * unkeyed: it catches a corrupted paste, nothing more, so a decoded address is
 * also checked to name keys a wallet could hold.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { unpackSubgroupViewingKey } from '../../../foundation/crypto/bjj';
import { bytesToBigintLE } from '../../../foundation/encoding/bytes';
import { fromHex, isHexOfLength, scalarToHex, toHex } from '../../../foundation/encoding/hex';
import { ownerPkPoint } from '../owner';

export const PRIVACY_ADDRESS_SCHEME = 'orbpriv3:';
/** Longer than any `orbpriv3:` string; refused before parsing. */
const MAX_ADDRESS_CHARS = 200;

/** A privacy address with the points a verifier computes with. */
export interface PaymentAddress {
    /** The recipient's owner key (BabyJubJub Ax). */
    ownerPk: bigint;
    ownerPoint: [bigint, bigint];
    /** The recipient's viewing public key, a prime-subgroup point. */
    viewingKey: [bigint, bigint];
    /** The same key packed (32 bytes LE), as the address carries it. */
    viewingPublicKey: Uint8Array;
}

const checksumOf = (body: string) =>
    toHex(sha256(new TextEncoder().encode(body)).slice(0, 4)).slice(2);

/**
 * The address in an `orbpriv3:` string, or null when it is malformed,
 * mistyped, or names keys no wallet could hold (an owner key off the curve, a
 * viewing key outside the prime subgroup).
 */
export function decodePaymentAddress(text: string): PaymentAddress | null {
    if (typeof text !== 'string' || text.length > MAX_ADDRESS_CHARS) return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith(PRIVACY_ADDRESS_SCHEME)) return null;
    const parts = trimmed.slice(PRIVACY_ADDRESS_SCHEME.length).split(':');
    if (parts.length !== 3) return null;
    const [rawOwnerPk, rawViewingKey, checksum] = parts as [string, string, string];
    // The checksum covers the text as written; the fields are then read in lower case,
    // so `0xAB…` and `0xab…` decode to one address, not two.
    if (checksumOf(`${PRIVACY_ADDRESS_SCHEME}${rawOwnerPk}:${rawViewingKey}`) !== checksum)
        return null;
    const ownerPkHex = rawOwnerPk.toLowerCase();
    const viewingKeyHex = rawViewingKey.toLowerCase();
    if (!isHexOfLength(ownerPkHex, 32) || !isHexOfLength(viewingKeyHex, 32)) return null;
    const ownerPk = BigInt(ownerPkHex);
    const ownerPoint = ownerPkPoint(ownerPk);
    const viewingPublicKey = fromHex(viewingKeyHex);
    // Prime subgroup only: a small-order key (the all-zero packed value among them,
    // a point of order 4) leaves every ECDH against it with at most 8 values.
    const viewingKey = unpackSubgroupViewingKey(bytesToBigintLE(viewingPublicKey));
    if (!ownerPoint || !viewingKey) return null;
    return { ownerPk, ownerPoint, viewingKey, viewingPublicKey };
}

/** The `orbpriv3:` address of an owner key and a packed viewing public key. */
export function encodePrivacyAddress(ownerPk: bigint, viewingPublicKey: Uint8Array): string {
    const body = `${PRIVACY_ADDRESS_SCHEME}${scalarToHex(ownerPk)}:${toHex(viewingPublicKey)}`;
    return `${body}:${checksumOf(body)}`;
}

/**
 * An `orbpriv3:` address as its two lowercase hex fields, or null under the same
 * rules as `decodePaymentAddress`.
 */
export function decodePrivacyAddress(
    text: string
): { ownerPkHex: string; viewingPublicKeyHex: string } | null {
    const address = decodePaymentAddress(text);
    return address
        ? {
              ownerPkHex: scalarToHex(address.ownerPk),
              viewingPublicKeyHex: toHex(address.viewingPublicKey),
          }
        : null;
}
