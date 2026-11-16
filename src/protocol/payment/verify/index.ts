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
 *   - ONE PAYMENT, ONE ORDER: store `commitmentHex` under a unique constraint,
 *     in the write that marks the order paid (check-then-insert races);
 *   - the lookup names the commitment to the node that answers it, and trusts
 *     its answer: use a node you run or trust.
 */
import { isServerBusyError } from '../../rpcErrors';
import { readPaymentSlip, type ReceivedPayment } from '../read';
import type { PaymentViewingKey } from '../viewingKey';

/** What the chain check needs: `client.privacy` (`PrivacyModule`) fits. */
export interface NoteTreeLookup {
    /** Where the commitment sits at the node's BEST block (a reorg can revert it). */
    getMerkleProofByCommitment(commitmentHex: string): Promise<{ leafIndex: number }>;
    /** Where it sits in the FINALIZED chain, or null. Needed unless `finality: 'best'`. */
    getFinalizedLeafIndex?(commitmentHex: string): Promise<number | null>;
}

/**
 * How landed a payment must be:
 * - `finalized` (default): in a finalized block, which no reorganisation reverts;
 * - `best`: in the node's best block — faster, but a reorg can drop it and let
 *   the payer spend the same notes again. Only for amounts you can lose.
 */
export type Finality = 'finalized' | 'best';

/** What the order expects to have been paid. */
export interface ExpectedPayment {
    /** Amount in the asset's smallest unit; more than zero. */
    value: bigint;
    /** Asset id (u32); `0n` is the native asset. */
    assetId: bigint;
}

/**
 * A payment as `verifyPayment` vouches for it: the slip's own `txHash` is left
 * out — anyone who paid once could reseal the slip with another, and a backend
 * keying orders on it would be paid twice. A payment is its `commitmentHex`.
 */
export type VerifiedPayment = Omit<ReceivedPayment, 'txHash' | 'leafIndex'>;

export type PaymentVerification =
    | { ok: true; payment: VerifiedPayment & { leafIndex: number } }
    | {
          ok: false;
          /**
           * - `not-for-you`: not sealed to this key, not this owner's note, or inconsistent;
           * - `wrong-asset` / `wrong-amount`: a real slip, not for the payment expected;
           * - `not-on-chain`: the note is not in the tree — never paid, or not landed yet;
           * - `not-final`: in a block, not finalized yet — retry in a few seconds.
           */
          reason: 'not-for-you' | 'wrong-asset' | 'wrong-amount' | 'not-on-chain' | 'not-final';
          // No payment: a slip's fields are public, so a refusal must not decrypt them for its sender.
      };

const U32_MAX = 0xffff_ffffn;

/** Throws on an expectation that cannot describe a payment: a wiring bug, not a payment to refuse. */
export function assertExpected(expected: ExpectedPayment): void {
    if (typeof expected?.value !== 'bigint' || expected.value <= 0n) {
        throw new TypeError(
            'payment verification: expected.value must be a bigint greater than zero'
        );
    }
    if (
        typeof expected.assetId !== 'bigint' ||
        expected.assetId < 0n ||
        expected.assetId > U32_MAX
    ) {
        throw new TypeError('payment verification: expected.assetId must be a u32 bigint');
    }
}

/** Why a payment that is the recipient's does not pay `expected`, or null when it does. */
export function mismatch(
    payment: { value: bigint; assetId: bigint },
    expected: ExpectedPayment
): 'wrong-asset' | 'wrong-amount' | null {
    if (payment.assetId !== expected.assetId) return 'wrong-asset';
    if (payment.value !== expected.value) return 'wrong-amount';
    return null;
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

/** A safe leaf index, or throws: a node answering nonsense must never confirm a payment. */
function leafIndexOrThrow(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new Error('payment verification: the node returned an invalid leaf index');
    }
    return value;
}

/**
 * Where the commitment landed: `{ final, leafIndex }`, or null when the node
 * has no such commitment. Throws when the node cannot answer or answers
 * nonsense, and on a `tree` that cannot read the finalized chain when
 * `finalized` is required (a wiring bug).
 */
export async function landedLeafIndex(
    tree: NoteTreeLookup,
    commitmentHex: string,
    finality: Finality = 'finalized'
): Promise<{ final: boolean; leafIndex: number } | null> {
    if (finality === 'finalized') {
        const finalized = await tree.getFinalizedLeafIndex!(commitmentHex);
        if (finalized !== null) return { final: true, leafIndex: leafIndexOrThrow(finalized) };
    }
    let proof: { leafIndex: number };
    try {
        proof = await tree.getMerkleProofByCommitment(commitmentHex);
    } catch (error) {
        if (isMissingCommitment(error)) return null;
        throw error;
    }
    return { final: finality === 'best', leafIndex: leafIndexOrThrow(proof?.leafIndex) };
}

/** Throws unless `tree` can do what `finality` asks: a wiring bug, not a payment to refuse. */
export function assertFinality(tree: NoteTreeLookup, finality: unknown): Finality {
    if (finality !== 'finalized' && finality !== 'best') {
        throw new TypeError("payment verification: finality must be 'finalized' or 'best'");
    }
    if (finality === 'finalized' && typeof tree?.getFinalizedLeafIndex !== 'function') {
        throw new TypeError(
            "payment verification: tree cannot read the finalized chain — pass client.privacy, or finality: 'best'"
        );
    }
    return finality;
}

/**
 * Whether `slip` is a landed payment of exactly `expected` to `key`'s owner.
 *
 * A slip proves a note TO you exists, not that whoever hands it over made it:
 * its fields are public on chain, and anyone can seal them to your address.
 * Settle an order on it only when the slip comes from a party you already
 * trust with that payment (your own wallet, reconciliation, a known payer
 * named by address); for orders from the public, verify the payer's
 * `orbproof1:` with `verifyPaymentProof`, which proves its maker. A refusal
 * carries no `payment`, so this is not an oracle for your incoming notes.
 *
 * Throws when the node cannot answer or answers nonsense — retry later rather
 * than reject an order that may well be paid — and on an unusable key or
 * expectation.
 */
export async function verifyPayment(
    slip: string,
    options: {
        key: PaymentViewingKey;
        tree: NoteTreeLookup;
        expected: ExpectedPayment;
        /** Default `finalized`. */
        finality?: Finality;
    }
): Promise<PaymentVerification> {
    assertExpected(options.expected);
    const finality = assertFinality(options.tree, options.finality ?? 'finalized');
    const read = readPaymentSlip(slip, options.key);
    if (!read) return { ok: false, reason: 'not-for-you' };
    const { txHash: _stated, leafIndex: _alsoStated, ...payment } = read;
    const wrong = mismatch(payment, options.expected);
    if (wrong) return { ok: false, reason: wrong };
    const landed = await landedLeafIndex(options.tree, payment.commitmentHex, finality);
    if (!landed) return { ok: false, reason: 'not-on-chain' };
    if (!landed.final) return { ok: false, reason: 'not-final' };
    const { leafIndex } = landed;
    return { ok: true, payment: { ...payment, leafIndex } };
}
