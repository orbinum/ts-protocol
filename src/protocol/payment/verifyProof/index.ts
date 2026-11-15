/**
 * Verifying a payment from the PAYER's proof, with the recipient's public
 * address only — no secret on the server:
 *
 *   1. the proof's ephemeral secret key must be the one the memo was sealed
 *      with (`[ephSk]·B` is the memo's ephemeral key), and gives the shared
 *      secret the recipient's wallet reaches with its viewing key;
 *   2. the note must open, be the address's (directly or by stealth) and
 *      recompute to the proof's commitment — so the recipient's wallet opens
 *      and can spend exactly this note;
 *   3. the expected asset and exact amount;
 *   4. the commitment's presence in the chain's note tree, in a FINALIZED block
 *      by default (`verifyPaymentProof` only; `checkPaymentProof` stops before
 *      it, for a caller that asks the node itself).
 *
 * A sender named by address is proven with the recipient's viewing key, which
 * this path does not have: such a note is refused (`invalid-proof`). Hub
 * Connect payments name the sender by pseudonym or not at all.
 *
 * Same duties as `verifyPayment`: one payment, one order (`commitmentHex` under
 * a unique constraint), and a node you trust.
 */
import { fromHex } from '../../../foundation/encoding/hex';
import { decodePaymentAddress, type PaymentAddress } from '../address';
import { proofSharedSecret } from '../memo';
import { openNote } from '../note';
import { decodePaymentProof } from '../proof';
import type { ReceivedPayment } from '../read';
import {
    assertExpected,
    assertFinality,
    landedLeafIndex,
    mismatch,
    type ExpectedPayment,
    type Finality,
    type NoteTreeLookup,
} from '../verify';

/** A payment as its proof shows it: only what the verification checked. */
export type ProvenPayment = Omit<ReceivedPayment, 'leafIndex' | 'txHash'>;

export type PaymentProofCheck =
    | { ok: true; payment: ProvenPayment }
    | {
          ok: false;
          /**
           * - `invalid-proof`: malformed, not this address's note, or inconsistent;
           * - `wrong-asset` / `wrong-amount`: a real payment, not the one expected.
           */
          reason: 'invalid-proof' | 'wrong-asset' | 'wrong-amount';
          payment?: ProvenPayment;
      };

export type PaymentProofVerification =
    | { ok: true; payment: ProvenPayment & { leafIndex: number } }
    | (
          | Extract<PaymentProofCheck, { ok: false }>
          | {
                ok: false;
                /**
                 * - `not-on-chain`: the note is not in the tree — never paid, or not landed yet;
                 * - `not-final`: in a block, not finalized yet — retry in a few seconds.
                 */
                reason: 'not-on-chain' | 'not-final';
                payment: ProvenPayment;
            }
      );

/** Throws on an address no wallet could hold: a misconfigured server, not a proof to refuse. */
// Decoding an address costs two subgroup checks; a verifier sends the same one
// on every request, so the last decoded address is kept (ponytail: one entry).
let lastAddress: { text: string; decoded: PaymentAddress } | undefined;

function usableAddress(address: string): PaymentAddress {
    if (lastAddress?.text === address) return lastAddress.decoded;
    const decoded = decodePaymentAddress(address);
    if (!decoded)
        throw new TypeError('payment verification: address is not a valid orbpriv3 address');
    lastAddress = { text: address, decoded };
    return decoded;
}

/**
 * Whether `proof` is a consistent payment of exactly `expected` to `address`,
 * offline: everything but the chain. Never throws on a bad proof; throws a
 * TypeError on an unusable address or expectation.
 */
export function checkPaymentProof(
    proof: string,
    options: { address: string; expected: ExpectedPayment }
): PaymentProofCheck {
    assertExpected(options.expected);
    const address = usableAddress(options.address);
    let payment: ProvenPayment | null;
    try {
        payment = prove(proof, address);
    } catch {
        // Whatever an adversarial proof trips deeper down, it proves nothing.
        payment = null;
    }
    if (!payment) return { ok: false, reason: 'invalid-proof' };
    const wrong = mismatch(payment, options.expected);
    return wrong ? { ok: false, reason: wrong, payment } : { ok: true, payment };
}

/**
 * `checkPaymentProof`, then the chain. Throws when the node cannot answer or
 * answers nonsense — retry rather than reject an order that may be paid.
 */
export async function verifyPaymentProof(
    proof: string,
    options: {
        address: string;
        tree: NoteTreeLookup;
        expected: ExpectedPayment;
        /** Default `finalized`. */
        finality?: Finality;
    }
): Promise<PaymentProofVerification> {
    const finality = assertFinality(options.tree, options.finality ?? 'finalized');
    const checked = checkPaymentProof(proof, options);
    if (!checked.ok) return checked;
    const landed = await landedLeafIndex(options.tree, checked.payment.commitmentHex, finality);
    if (!landed) return { ok: false, reason: 'not-on-chain', payment: checked.payment };
    if (!landed.final) return { ok: false, reason: 'not-final', payment: checked.payment };
    return { ok: true, payment: { ...checked.payment, leafIndex: landed.leafIndex } };
}

function prove(text: string, address: PaymentAddress): ProvenPayment | null {
    const proof = decodePaymentProof(text);
    if (!proof) return null;
    const memo = fromHex(proof.encryptedMemo);
    const sharedSecret = proofSharedSecret(
        memo,
        fromHex(proof.ephemeralSecretKey),
        address.viewingKey
    );
    if (!sharedSecret) return null;
    const note = openNote({
        memo,
        commitment: fromHex(proof.commitmentHex),
        sharedSecret,
        ownerPk: address.ownerPk,
        ownerPoint: address.ownerPoint,
    });
    if (!note) return null;
    return { commitmentHex: proof.commitmentHex, ...note };
}
