/**
 * Opening a received note once the memo's shared secret is known — the step a
 * viewing key (`read`) and a payer's proof (`proof`) reach from opposite sides:
 *
 *   1. open the memo (its key mixes in the commitment);
 *   2. require the note to be the recipient's, directly or through its stealth
 *      address;
 *   3. recompute the commitment from what the memo says; a sender named by
 *      address is proven the same way, which needs the recipient's viewing key.
 */
import { bytesToBigintLE } from '../../../foundation/encoding/bytes';
import { noteCommitment } from '../commitment';
import { memoViewTagMatches, openMemo } from '../memo';
import { isOwnedBy } from '../owner';
import { decodeSenderClaim, senderAddressClaim, type PaymentSender } from '../sender';
import { encodePrivacyAddress } from '../address';

/** What a consistent note says: its amount and who sent it. */
export interface OpenedNote {
    value: bigint;
    assetId: bigint;
    sender: PaymentSender;
}

export interface NoteToOpen {
    /** The 180-byte encrypted memo. */
    memo: Uint8Array;
    /** The note's 32-byte LE commitment. */
    commitment: Uint8Array;
    /** The memo's ECDH shared secret (32 bytes). */
    sharedSecret: Uint8Array;
    /** The recipient's owner key and its point. */
    ownerPk: bigint;
    ownerPoint: [bigint, bigint];
    /**
     * The recipient's viewing secret key: proves a sender address claim. Without
     * it a note whose commitment only an address claim explains is refused.
     */
    viewingSecretKey?: Uint8Array;
}

/** The note's amount and sender if it is the recipient's and consistent, else null. */
export function openNote(note: NoteToOpen): OpenedNote | null {
    const { memo, commitment, sharedSecret } = note;
    if (!memoViewTagMatches(memo, sharedSecret)) return null;
    const plaintext = openMemo(memo, commitment, sharedSecret);
    if (!plaintext) return null;
    if (!isOwnedBy(plaintext.ownerPk, note.ownerPk, note.ownerPoint, sharedSecret)) return null;

    const onChain = bytesToBigintLE(commitment);
    const { value, assetId, ownerPk } = plaintext;
    if (noteCommitment(value, assetId, ownerPk, plaintext.blinding) === onChain) {
        const claim = decodeSenderClaim(plaintext.sourcePk);
        // An address claim that did not shape the commitment is unproven: anonymous.
        return {
            value,
            assetId,
            sender: claim.kind === 'pseudonym' ? claim : { kind: 'anonymous' },
        };
    }
    if (!note.viewingSecretKey) return null;
    const claim = senderAddressClaim(plaintext, sharedSecret, note.viewingSecretKey);
    if (!claim || noteCommitment(value, assetId, ownerPk, claim.blinding) !== onChain) return null;
    return {
        value,
        assetId,
        sender: {
            kind: 'address',
            address: encodePrivacyAddress(claim.ownerPk, claim.viewingPublicKey),
        },
    };
}
