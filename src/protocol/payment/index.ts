/**
 * Payment verification with the recipient's VIEWING key — for a backend that
 * confirms a payment without holding a key that can spend.
 *
 *   memo/        open a note's memo (ECDH shared secret, view tag, decryption)
 *   owner/       owner-key points, stealth owner keys, "is this note theirs"
 *   commitment/  the note commitment (Poseidon4)
 *   sender/      the declared sender: pseudonym, address (and its proof), orbpriv3
 *   viewingKey/  the verifier's key and its `orbview1:` export
 *   read/        readPaymentSlip — steps 1–3, offline
 *   verify/      verifyPayment — steps 4–5, amount and chain
 *
 * Only the API below is public; the rest is the read path, ported byte for byte
 * from the wallet and pinned to it by `tests/vectors/payment-verification.json`.
 */
export { readPaymentSlip } from './read';
export type { ReceivedPayment } from './read';
export { verifyPayment } from './verify';
export type { ExpectedPayment, NoteTreeLookup, PaymentVerification } from './verify';
export type { PaymentSender } from './sender';
export { encodeViewingKey, decodeViewingKey, VIEWING_KEY_SCHEME } from './viewingKey';
export type { PaymentViewingKey } from './viewingKey';
