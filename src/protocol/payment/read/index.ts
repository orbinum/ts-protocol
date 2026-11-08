/**
 * Reading a payment from its slip, offline, with the recipient's viewing key:
 *
 *   1. open the slip (sealed to the viewing key);
 *   2. open the note's memo and check the note is the recipient's — named
 *      directly or through its stealth address;
 *   3. recompute the commitment from what the memo says and require it to be
 *      the slip's; a sender named by address is proven the same way.
 *
 * A slip that passes is CONSISTENT, not paid: anyone holding the recipient's
 * address can seal one around a note never submitted. `verifyPayment` adds the
 * amount and the chain.
 */
import { bytesToBigintLE } from '../../../foundation/encoding/bytes';
import { fromHex } from '../../../foundation/encoding/hex';
import { decodePaymentSlip, openPaymentSlip } from '../../memo/PaymentSlip';
import { noteCommitment } from '../commitment';
import { memoSharedSecret, memoViewTagMatches, openMemo } from '../memo';
import { isOwnedBy } from '../owner';
import {
    decodeSenderClaim,
    privacyAddressOf,
    senderAddressClaim,
    type PaymentSender,
} from '../sender';
import { usableViewingKey, type PaymentViewingKey } from '../viewingKey';

/** Longer than any `orbslip1:` string; refused before decoding. */
const MAX_SLIP_CHARS = 4096;

/** A payment read from its slip: the received note's public facts and what its memo says. */
export interface ReceivedPayment {
    /** 0x-prefixed 32-byte LE commitment of the received note: the payment's identity. */
    commitmentHex: string;
    /** Amount, in the asset's smallest unit. */
    value: bigint;
    assetId: bigint;
    /** Leaf index the slip states; informational, not checked. */
    leafIndex?: number;
    /** Transaction hash the slip states; informational, not checked. */
    txHash?: string;
    sender: PaymentSender;
}

/**
 * The payment in `slip` if it is addressed to `key`'s owner and consistent,
 * else null. Never throws on a bad slip (untrusted input); throws a TypeError
 * on an unusable key (a wiring bug, which "not yours" for every slip would hide).
 */
export function readPaymentSlip(slip: string, key: PaymentViewingKey): ReceivedPayment | null {
    const ownerPoint = usableViewingKey(key);
    if (typeof slip !== 'string' || slip.length > MAX_SLIP_CHARS) return null;
    try {
        return read(slip.trim(), key, ownerPoint);
    } catch {
        // Whatever an adversarial slip trips deeper down, it is "not a payment".
        return null;
    }
}

function read(
    slip: string,
    key: PaymentViewingKey,
    ownerPoint: [bigint, bigint]
): ReceivedPayment | null {
    const envelope = decodePaymentSlip(slip);
    if (!envelope) return null;
    const fields = openPaymentSlip(key.viewingSecretKey, envelope);
    if (!fields) return null;

    const memo = fromHex(fields.encryptedMemo);
    const commitmentBytes = fromHex(fields.commitmentHex);
    const sharedSecret = memoSharedSecret(memo, key.viewingSecretKey);
    if (!sharedSecret || !memoViewTagMatches(memo, sharedSecret)) return null;
    const plaintext = openMemo(memo, commitmentBytes, sharedSecret);
    if (!plaintext) return null;
    if (!isOwnedBy(plaintext.ownerPk, key.ownerPk, ownerPoint, sharedSecret)) return null;

    const onChain = bytesToBigintLE(commitmentBytes);
    const { value, assetId, ownerPk } = plaintext;
    let sender: PaymentSender;
    if (noteCommitment(value, assetId, ownerPk, plaintext.blinding) === onChain) {
        const claim = decodeSenderClaim(plaintext.sourcePk);
        // An address claim that did not shape the commitment is unproven: anonymous.
        sender = claim.kind === 'pseudonym' ? claim : { kind: 'anonymous' };
    } else {
        const claim = senderAddressClaim(plaintext, sharedSecret, key.viewingSecretKey);
        if (!claim || noteCommitment(value, assetId, ownerPk, claim.blinding) !== onChain)
            return null;
        sender = {
            kind: 'address',
            address: privacyAddressOf(claim.ownerPk, claim.viewingPublicKey),
        };
    }

    return {
        commitmentHex: fields.commitmentHex,
        value,
        assetId,
        ...(fields.leafIndex !== undefined ? { leafIndex: fields.leafIndex } : {}),
        ...(fields.txHash !== undefined ? { txHash: fields.txHash } : {}),
        sender,
    };
}
