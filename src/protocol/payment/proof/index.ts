/**
 * Payment proof — what a PAYER hands the recipient's server so it confirms the
 * payment with nothing but the recipient's public address:
 *
 *   `orbproof1:{commitment}:{encryptedMemo}:{ephemeralSecretKey}:{checksum}`
 *
 * The ephemeral secret key is the one the payer sealed the note's memo with.
 * With it and the recipient's public viewing key, the server reaches the same
 * shared secret the recipient's wallet does, opens the memo and checks the note
 * (`verifyPaymentProof`).
 *
 * What it reveals, to whoever holds it: this one note's amount, asset and
 * declared sender, and that it went to this address. Nothing about the payer's
 * other notes — the ephemeral is fresh per note, derived from the payer's
 * outgoing key by a PRF or drawn at random — and nothing that spends.
 *
 * Not sealed, unlike a payment slip: it is meant for a server that has no
 * secret to open one with. Send it over TLS, like the order it pays.
 *
 * Only fields the verifier checks: no transaction hash, leaf index or label a
 * payer could set freely — a backend that keyed orders on one of those could
 * be paid twice with the same proof. A payment is its `commitmentHex`.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { fromHex, isHexOfLength, toHex } from '../../../foundation/encoding/hex';
import { ENCRYPTED_MEMO_SIZE } from '../../memo/memoFormat';

export const PAYMENT_PROOF_SCHEME = 'orbproof1:';
/** Longer than any `orbproof1:` string; refused before parsing. */
const MAX_PROOF_CHARS = 1024;

/** The fields of a payment proof, hex `0x`-prefixed. */
export interface PaymentProof {
    /** The payment note's 32-byte LE commitment. */
    commitmentHex: string;
    /** The note's 180-byte encrypted memo. */
    encryptedMemo: string;
    /** The 32-byte ephemeral secret key the memo was sealed with. */
    ephemeralSecretKey: string;
}

const checksumOf = (body: string) =>
    toHex(sha256(new TextEncoder().encode(body)).slice(0, 4)).slice(2);

const wellFormed = (p: PaymentProof) =>
    isHexOfLength(p.commitmentHex, 32) &&
    isHexOfLength(p.encryptedMemo, ENCRYPTED_MEMO_SIZE) &&
    isHexOfLength(p.ephemeralSecretKey, 32);

/** Throws on fields that are not a proof: the payer's own bug, never an input to tolerate. */
export function encodePaymentProof(proof: PaymentProof): string {
    if (!wellFormed(proof)) throw new TypeError('encodePaymentProof: malformed fields');
    const body = `${PAYMENT_PROOF_SCHEME}${[
        proof.commitmentHex,
        proof.encryptedMemo,
        proof.ephemeralSecretKey,
    ]
        .map((hex) => toHex(fromHex(hex)))
        .join(':')}`;
    return `${body}:${checksumOf(body)}`;
}

/** The fields of an `orbproof1:` string, or null when it is malformed or mistyped. */
export function decodePaymentProof(text: string): PaymentProof | null {
    if (typeof text !== 'string' || text.length > MAX_PROOF_CHARS) return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith(PAYMENT_PROOF_SCHEME)) return null;
    const parts = trimmed.slice(PAYMENT_PROOF_SCHEME.length).split(':');
    if (parts.length !== 4) return null;
    const [commitmentHex, encryptedMemo, ephemeralSecretKey, checksum] = parts as [
        string,
        string,
        string,
        string,
    ];
    const proof = { commitmentHex, encryptedMemo, ephemeralSecretKey };
    if (!wellFormed(proof)) return null;
    if (checksumOf(trimmed.slice(0, trimmed.lastIndexOf(':'))) !== checksum) return null;
    // Lowercase, so one payment has one `commitmentHex` to deduplicate orders by.
    const canonical = (hex: string) => toHex(fromHex(hex));
    return {
        commitmentHex: canonical(commitmentHex),
        encryptedMemo: canonical(encryptedMemo),
        ephemeralSecretKey: canonical(ephemeralSecretKey),
    };
}
