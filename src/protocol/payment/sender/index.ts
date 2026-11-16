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
import { secretMulPoint } from '../../../foundation/crypto/bjj-fast';
import { unpackSubgroupViewingKey } from '../../../foundation/crypto/bjj';
import { bigintTo32Le, bytesToBigintLE } from '../../../foundation/encoding/bytes';
import { bytesToBjjScalar } from '../../memo/memoFormat';
import type { MemoPlaintext } from '../memo';
import { ownerPkPoint } from '../owner';
import { claimedViewingKey, decodeSenderClaim } from './encoding';

export * from './encoding';

/** Who the payment says it came from. An address is reported only once its claim verified. */
export type PaymentSender =
    | { kind: 'anonymous' }
    | { kind: 'pseudonym'; name: string }
    | { kind: 'address'; address: string };

const IDENTITY_BLINDING_DOMAIN = new TextEncoder().encode('orbinum-sender-identity-v1');

/** The two static secrets that authenticate an address claim. */
export interface SenderAuth {
    /** `ECDH(sender ivk, recipient ivk)`: binds the viewing key. */
    viewing: Uint8Array;
    /** `ECDH(sender spending key, recipient ivk)`: binds `ownerPk`. */
    owner: Uint8Array;
}

/**
 * The blinding of a payment that names its sender by address.
 *
 * Bound to the payment's ephemeral secret (hidden from outsiders), to both
 * static secrets (only the sender's keys or the recipient's viewing key reach
 * them) and to the claimed address, so a recipient that recomputes the
 * commitment has checked all of them.
 */
export function deriveSenderAddressBlinding(
    sharedSecret: Uint8Array,
    auth: SenderAuth,
    senderOwnerPk: bigint,
    senderViewingPublicKey: Uint8Array
): bigint {
    const ikm = new Uint8Array(96);
    ikm.set(sharedSecret.subarray(0, 32));
    ikm.set(auth.viewing.subarray(0, 32), 32);
    ikm.set(auth.owner.subarray(0, 32), 64);
    const info = new Uint8Array(IDENTITY_BLINDING_DOMAIN.length + 64);
    info.set(IDENTITY_BLINDING_DOMAIN);
    info.set(bigintTo32Le(senderOwnerPk), IDENTITY_BLINDING_DOMAIN.length);
    info.set(senderViewingPublicKey.subarray(0, 32), IDENTITY_BLINDING_DOMAIN.length + 32);
    // 48 bytes reduced mod r keeps the bias below 2^-128.
    const value = bytesToBigintLE(hkdf(sha256, ikm, undefined, info, 48)) % BN254_R;
    return value === 0n ? 1n : value;
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
    const viewingPublicKey = claimedViewingKey(claim.viewingKeySign, plaintext.blinding);
    const senderPoint = unpackSubgroupViewingKey(bytesToBigintLE(viewingPublicKey));
    const ownerPoint = ownerPkPoint(claim.ownerPk);
    if (!senderPoint || !ownerPoint) return null;
    // Constant-time: the scalar is the recipient's viewing secret key.
    const scalar = bytesToBjjScalar(viewingSecretKey);
    const auth = {
        viewing: bigintTo32Le(secretMulPoint(senderPoint, scalar)[0]),
        owner: bigintTo32Le(secretMulPoint(ownerPoint, scalar)[0]),
    };
    const blinding = deriveSenderAddressBlinding(
        sharedSecret,
        auth,
        claim.ownerPk,
        viewingPublicKey
    );
    return { blinding, ownerPk: claim.ownerPk, viewingPublicKey };
}
