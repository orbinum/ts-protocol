/**
 * Who a payment says it came from — the memo's `sourcePk` — and, for a sender
 * named by address, the check that proves it.
 *
 * Bits 254–255 of `sourcePk` name the form: 00 anonymous, 01 pseudonym (1–24
 * ASCII letters or digits), 1s address (bits 0–253 the sender's owner key, `s`
 * its viewing key's sign bit, whose y rides in the memo's blinding field).
 * Anything not canonical reads as anonymous.
 */
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { BN254_R } from '../../../foundation/crypto/constants';
import { fastMulPoint } from '../../../foundation/crypto/bjj-fast';
import { unpackSubgroupViewingKey } from '../../../foundation/crypto/bjj';
import { bigintTo32Le, bytesToBigintLE } from '../../../foundation/encoding/bytes';
import { scalarToHex, toHex } from '../../../foundation/encoding/hex';
import { bytesToBjjScalar } from '../../memo/memoFormat';
import type { MemoPlaintext } from '../memo';
import { ownerPkPoint } from '../owner';

/** Who the payment says it came from. An address is reported only once its claim verified. */
export type PaymentSender =
    | { kind: 'anonymous' }
    | { kind: 'pseudonym'; name: string }
    | { kind: 'address'; address: string };

type SenderClaim =
    | { kind: 'anonymous' }
    | { kind: 'pseudonym'; name: string }
    | { kind: 'address'; ownerPk: bigint; viewingKeySign: 0n | 1n };

const TAG_SHIFT = 254n;
const BODY_MASK = (1n << TAG_SHIFT) - 1n;
const TAG_PSEUDONYM = 1n;
const TAG_ADDRESS = 2n;
const Y_MASK = (1n << 255n) - 1n;
const PSEUDONYM_MAX = 24;
const PSEUDONYM = /^[A-Za-z0-9]{1,24}$/;
const IDENTITY_BLINDING_DOMAIN = new TextEncoder().encode('orbinum-sender-identity-v1');

/** What `sourcePk` claims, read strictly. */
export function decodeSenderClaim(sourcePk: bigint): SenderClaim {
    const anonymous = { kind: 'anonymous' } as const;
    if (typeof sourcePk !== 'bigint' || sourcePk <= 0n || sourcePk >> 256n !== 0n) return anonymous;
    const tag = sourcePk >> TAG_SHIFT;
    const body = sourcePk & BODY_MASK;
    if (tag === TAG_PSEUDONYM) {
        if (body >> BigInt(8 * PSEUDONYM_MAX) !== 0n) return anonymous;
        const bytes = bigintTo32Le(body).subarray(0, PSEUDONYM_MAX);
        const end = bytes.indexOf(0);
        const used = end === -1 ? bytes : bytes.subarray(0, end);
        // Zero padding only after the name: a byte past the first zero is not canonical.
        if (bytes.subarray(used.length).some((b) => b !== 0)) return anonymous;
        const name = String.fromCharCode(...used);
        return PSEUDONYM.test(name) ? { kind: 'pseudonym', name } : anonymous;
    }
    if (tag >= TAG_ADDRESS) {
        if (body === 0n || body >= BN254_R) return anonymous;
        return { kind: 'address', ownerPk: body, viewingKeySign: tag === TAG_ADDRESS ? 0n : 1n };
    }
    return anonymous;
}

/**
 * The blinding an address claim implies and the address it names, or null
 * when the memo names no usable address. Proven only by the caller's
 * commitment check: the blinding is bound to the payment's secret, to secrets
 * only the claimed sender's keys or the recipient's viewing key reach, and to
 * the claimed address.
 */
export function senderAddressClaim(
    plaintext: Pick<MemoPlaintext, 'sourcePk' | 'blinding'>,
    sharedSecret: Uint8Array,
    viewingSecretKey: Uint8Array
): { blinding: bigint; ownerPk: bigint; viewingPublicKey: Uint8Array } | null {
    const claim = decodeSenderClaim(plaintext.sourcePk);
    if (claim.kind !== 'address') return null;
    const viewingPublicKey = bigintTo32Le(
        (claim.viewingKeySign << 255n) | (plaintext.blinding & Y_MASK)
    );
    const senderPoint = unpackSubgroupViewingKey(bytesToBigintLE(viewingPublicKey));
    const ownerPoint = ownerPkPoint(claim.ownerPk);
    if (!senderPoint || !ownerPoint) return null;
    const scalar = bytesToBjjScalar(viewingSecretKey);
    const ikm = new Uint8Array(96);
    ikm.set(sharedSecret.subarray(0, 32));
    ikm.set(bigintTo32Le(fastMulPoint(senderPoint, scalar)[0]), 32);
    ikm.set(bigintTo32Le(fastMulPoint(ownerPoint, scalar)[0]), 64);
    const info = new Uint8Array(IDENTITY_BLINDING_DOMAIN.length + 64);
    info.set(IDENTITY_BLINDING_DOMAIN);
    info.set(bigintTo32Le(claim.ownerPk), IDENTITY_BLINDING_DOMAIN.length);
    info.set(viewingPublicKey, IDENTITY_BLINDING_DOMAIN.length + 32);
    // 48 bytes reduced mod r keeps the bias below 2^-128.
    const derived = bytesToBigintLE(hkdf(sha256, ikm, undefined, info, 48)) % BN254_R;
    return { blinding: derived === 0n ? 1n : derived, ownerPk: claim.ownerPk, viewingPublicKey };
}

/** `orbpriv3:` address of an owner key and packed viewing key, with its checksum. */
export function privacyAddressOf(ownerPk: bigint, viewingPublicKey: Uint8Array): string {
    const body = `orbpriv3:${scalarToHex(ownerPk)}:${toHex(viewingPublicKey)}`;
    const checksum = toHex(sha256(new TextEncoder().encode(body)).slice(0, 4)).slice(2);
    return `${body}:${checksum}`;
}
