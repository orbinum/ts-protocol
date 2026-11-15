/**
 * The recipient's public `orbpriv3:` address, as a payment verifier reads it:
 * `orbpriv3:{ownerPk hex}:{packed viewing public key hex}:{checksum}`.
 *
 * Public: a shop prints it on its checkout page. It lets a payer's proof be
 * checked (`verifyPaymentProof`) without any secret on the server.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { unpackSubgroupViewingKey } from '../../../foundation/crypto/bjj';
import { bytesToBigintLE } from '../../../foundation/encoding/bytes';
import { fromHex, isHexOfLength, toHex } from '../../../foundation/encoding/hex';
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
    const [ownerPkHex, viewingKeyHex, checksum] = parts as [string, string, string];
    if (!isHexOfLength(ownerPkHex, 32) || !isHexOfLength(viewingKeyHex, 32)) return null;
    if (checksumOf(`${PRIVACY_ADDRESS_SCHEME}${ownerPkHex}:${viewingKeyHex}`) !== checksum)
        return null;
    const ownerPk = BigInt(ownerPkHex);
    const ownerPoint = ownerPkPoint(ownerPk);
    const viewingKey = unpackSubgroupViewingKey(bytesToBigintLE(fromHex(viewingKeyHex)));
    if (!ownerPoint || !viewingKey) return null;
    return { ownerPk, ownerPoint, viewingKey };
}
