/**
 * Verifying a payment: `readPaymentSlip`, then
 *
 *   4. the expected asset and the exact amount;
 *   5. the commitment's presence in the chain's note tree.
 *
 * The chain is asked last, and only about a slip that is consistent, addressed
 * to this key and for the expected amount — a slip an attacker submits cannot
 * make the backend query the node about arbitrary commitments.
 *
 * Two duties stay with the caller:
 *   - ONE SLIP, ONE ORDER: store `commitmentHex` and refuse it a second time;
 *   - the lookup names the commitment to the node that answers it, and trusts
 *     its answer: use a node you run or trust.
 */
import { isServerBusyError } from '../../../chain/rpc/busy';
import { readPaymentSlip, type ReceivedPayment } from '../read';
import type { PaymentViewingKey } from '../viewingKey';

/** What the chain check needs: `client.privacy` (`PrivacyModule`) fits. */
export interface NoteTreeLookup {
    getMerkleProofByCommitment(commitmentHex: string): Promise<{ leafIndex: number }>;
}

/** What the order expects to have been paid. */
export interface ExpectedPayment {
    /** Amount in the asset's smallest unit; more than zero. */
    value: bigint;
    /** Asset id (u32); `0n` is the native asset. */
    assetId: bigint;
}

export type PaymentVerification =
    | { ok: true; payment: ReceivedPayment & { leafIndex: number } }
    | {
          ok: false;
          /**
           * - `not-for-you`: not sealed to this key, not this owner's note, or inconsistent;
           * - `wrong-asset` / `wrong-amount`: a real slip, not for the payment expected;
           * - `not-on-chain`: the note is not in the tree — never paid, or not landed yet.
           */
          reason: 'not-for-you' | 'wrong-asset' | 'wrong-amount' | 'not-on-chain';
          payment?: ReceivedPayment;
      };

const U32_MAX = 0xffff_ffffn;

/** Throws on an expectation that cannot describe a payment: a wiring bug, not a slip to refuse. */
function assertExpected(expected: ExpectedPayment): void {
    if (typeof expected?.value !== 'bigint' || expected.value <= 0n) {
        throw new TypeError('verifyPayment: expected.value must be a bigint greater than zero');
    }
    if (
        typeof expected.assetId !== 'bigint' ||
        expected.assetId < 0n ||
        expected.assetId > U32_MAX
    ) {
        throw new TypeError('verifyPayment: expected.assetId must be a u32 bigint');
    }
}

/**
 * Whether a lookup error says "no such commitment". Only that wording counts;
 * a busy node, a missing RPC method or a dropped connection is a node that
 * could not answer, never proof that the order is unpaid.
 */
export function isMissingCommitment(error: unknown): boolean {
    if (isServerBusyError(error)) return false;
    const message = error instanceof Error ? error.message : String(error);
    if (/method not found|unknown method|not connected|timeout/i.test(message)) return false;
    return /commitment not found|no merkle proof|no merkle leaf/i.test(message);
}

/**
 * Whether `slip` is a landed payment of exactly `expected` to `key`'s owner.
 * Throws when the node cannot answer or answers nonsense — retry later rather
 * than reject an order that may well be paid — and on an unusable key or
 * expectation.
 */
export async function verifyPayment(
    slip: string,
    options: { key: PaymentViewingKey; tree: NoteTreeLookup; expected: ExpectedPayment }
): Promise<PaymentVerification> {
    assertExpected(options.expected);
    const payment = readPaymentSlip(slip, options.key);
    if (!payment) return { ok: false, reason: 'not-for-you' };
    if (payment.assetId !== options.expected.assetId)
        return { ok: false, reason: 'wrong-asset', payment };
    if (payment.value !== options.expected.value)
        return { ok: false, reason: 'wrong-amount', payment };

    let proof: { leafIndex: number };
    try {
        proof = await options.tree.getMerkleProofByCommitment(payment.commitmentHex);
    } catch (error) {
        if (isMissingCommitment(error)) return { ok: false, reason: 'not-on-chain', payment };
        throw error;
    }
    const leafIndex = proof?.leafIndex;
    if (!Number.isSafeInteger(leafIndex) || leafIndex < 0) {
        throw new Error('verifyPayment: the node returned a proof without a valid leaf index');
    }
    return { ok: true, payment: { ...payment, leafIndex } };
}
