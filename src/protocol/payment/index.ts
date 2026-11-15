/**
 * Payment verification, for a backend that confirms a payment without holding
 * a key that can spend — two ways:
 *
 *   - from the PAYER's proof, with the recipient's public address only
 *     (`verifyPaymentProof`): no secret on the server;
 *   - from a payment slip, with the recipient's VIEWING key (`verifyPayment`):
 *     also proves a sender named by address.
 *
 *   memo/        open a note's memo (shared secret from a viewing key or a payer's ephemeral)
 *   owner/       owner-key points, stealth owner keys, "is this note theirs"
 *   commitment/  the note commitment (Poseidon4)
 *   sender/      the declared sender: pseudonym, address (and its proof), orbpriv3
 *   note/        open a received note once its shared secret is known
 *   address/     the recipient's public `orbpriv3:` address
 *   proof/       the payer's `orbproof1:` proof
 *   viewingKey/  the verifier's key and its `orbview1:` export
 *   read/        readPaymentSlip — a slip, offline
 *   verify/      verifyPayment — amount and chain
 *   verifyProof/ checkPaymentProof / verifyPaymentProof — a proof, offline and on chain
 *
 * Only the API below is public; the rest is the read path, ported byte for byte
 * from the wallet and pinned to it by `tests/vectors/payment-*.json`.
 */
export { readPaymentSlip } from './read';
export type { ReceivedPayment } from './read';
export { verifyPayment } from './verify';
export type {
    ExpectedPayment,
    Finality,
    NoteTreeLookup,
    PaymentVerification,
    VerifiedPayment,
} from './verify';
export { checkPaymentProof, verifyPaymentProof } from './verifyProof';
export type { PaymentProofCheck, PaymentProofVerification, ProvenPayment } from './verifyProof';
export { encodePaymentProof, decodePaymentProof, PAYMENT_PROOF_SCHEME } from './proof';
export type { PaymentProof } from './proof';
export { decodePaymentAddress, PRIVACY_ADDRESS_SCHEME } from './address';
export {
    commitmentLeafIndexKey,
    COMMITMENT_TO_LEAF_INDEX_PREFIX,
} from '../../chain/rpc/finalizedLeaf';
export type { PaymentAddress } from './address';
export type { PaymentSender } from './sender';
export { encodeViewingKey, decodeViewingKey, VIEWING_KEY_SCHEME } from './viewingKey';
export type { PaymentViewingKey } from './viewingKey';
