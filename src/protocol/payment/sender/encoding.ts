/**
 * The `sourcePk` encodings: how a payment names its sender in its 32 bytes.
 *
 * The two top bits (bits 254–255, little-endian) name the form. Every value an
 * older wallet wrote there is a field element below BN254 r < 2^254, so those
 * bits were always 00:
 *
 *   00  zero: anonymous. Non-zero: a legacy or unknown value, read as anonymous.
 *   01  pseudonym: 1–24 ASCII letters or digits in bytes 0–23, the rest zero.
 *   1s  address: bits 0–253 are the sender's `ownerPk`; `s` is its viewing
 *       key's sign bit, whose y coordinate rides in the memo's BLINDING field.
 *
 * Reading is strict: anything not in canonical form reads as anonymous.
 */
import { BN254_R } from '../../../foundation/crypto/constants';
import { bigintTo32Le, bytesToBigintLE } from '../../../foundation/encoding/bytes';

/** Longest pseudonym a payment can carry. */
export const SENDER_PSEUDONYM_MAX = 24;

const PSEUDONYM_PATTERN = new RegExp(`^[A-Za-z0-9]{1,${SENDER_PSEUDONYM_MAX}}$`);
const TAG_SHIFT = 254n;
const BODY_MASK = (1n << TAG_SHIFT) - 1n;
const TAG_PSEUDONYM = 1n;
const TAG_ADDRESS = 2n;
/** A packed viewing key without its sign bit: the y coordinate. */
const Y_MASK = (1n << 255n) - 1n;

/** What a note's `sourcePk` claims. An address claim is unverified here. */
export type SenderClaim =
    | { kind: 'anonymous' }
    | { kind: 'pseudonym'; name: string }
    | { kind: 'address'; ownerPk: bigint; viewingKeySign: 0n | 1n };

/** Whether `name` is a pseudonym a payment can carry: 1–24 ASCII letters or digits. */
export function isValidSenderPseudonym(name: unknown): name is string {
    return typeof name === 'string' && PSEUDONYM_PATTERN.test(name);
}

/** The `sourcePk` naming the sender by `name`. Throws on an invalid pseudonym. */
export function encodeSenderPseudonym(name: string): bigint {
    if (!isValidSenderPseudonym(name)) {
        throw new Error(
            `encodeSenderPseudonym: a pseudonym is 1-${SENDER_PSEUDONYM_MAX} ASCII letters or digits`
        );
    }
    const bytes = new Uint8Array(32);
    for (let i = 0; i < name.length; i++) bytes[i] = name.charCodeAt(i);
    return (TAG_PSEUDONYM << TAG_SHIFT) | bytesToBigintLE(bytes);
}

/**
 * The `sourcePk` naming the sender by its address, and the value the memo's
 * blinding field carries: the viewing key's y coordinate.
 */
export function encodeSenderAddress(
    ownerPk: bigint,
    viewingPublicKey: Uint8Array
): { sourcePk: bigint; viewingKeyY: bigint } {
    if (ownerPk <= 0n || ownerPk >= BN254_R) {
        throw new Error('encodeSenderAddress: ownerPk is not a field element');
    }
    if (viewingPublicKey.length !== 32) {
        throw new Error('encodeSenderAddress: viewing key must be 32 bytes');
    }
    const packed = bytesToBigintLE(viewingPublicKey);
    const sign = packed >> 255n;
    return {
        sourcePk: ((TAG_ADDRESS | sign) << TAG_SHIFT) | ownerPk,
        viewingKeyY: packed & Y_MASK,
    };
}

/**
 * What `sourcePk` claims, read strictly: anything not in canonical form —
 * a pseudonym with a stray byte or character, an owner key out of range —
 * reads as anonymous, never as an error.
 */
export function decodeSenderClaim(sourcePk: bigint | undefined): SenderClaim {
    const anonymous = { kind: 'anonymous' } as const;
    if (typeof sourcePk !== 'bigint' || sourcePk <= 0n || sourcePk >> 256n !== 0n) {
        return anonymous;
    }
    const tag = sourcePk >> TAG_SHIFT;
    const body = sourcePk & BODY_MASK;
    if (tag === TAG_PSEUDONYM) {
        if (body >> BigInt(8 * SENDER_PSEUDONYM_MAX) !== 0n) return anonymous;
        const bytes = bigintTo32Le(body).subarray(0, SENDER_PSEUDONYM_MAX);
        const end = bytes.indexOf(0);
        const used = end === -1 ? bytes : bytes.subarray(0, end);
        // Zero padding only after the name: a byte past the first zero is not canonical.
        if (bytes.subarray(used.length).some((b) => b !== 0)) return anonymous;
        const name = String.fromCharCode(...used);
        return isValidSenderPseudonym(name) ? { kind: 'pseudonym', name } : anonymous;
    }
    if (tag >= TAG_ADDRESS) {
        if (body === 0n || body >= BN254_R) return anonymous;
        return { kind: 'address', ownerPk: body, viewingKeySign: tag === TAG_ADDRESS ? 0n : 1n };
    }
    return anonymous;
}

/** The packed viewing key an address claim names, from its sign and the memo's y. */
export function claimedViewingKey(viewingKeySign: 0n | 1n, viewingKeyY: bigint): Uint8Array {
    return bigintTo32Le((viewingKeySign << 255n) | (viewingKeyY & Y_MASK));
}
