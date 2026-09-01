/**
 * The public memo surface: the wire format (size and boundary checks) and the
 * payment slip a dapp hands a wallet.
 *
 * A memo's 180-byte layout is normative wire format — the chain stores it as an
 * opaque blob, so this code defines its size and what counts as well-formed.
 * Sealing a note into a memo and opening one are custody (they derive keys from
 * a shared secret), so they live in the wallet, not here.
 */
export { MemoFormat, ENCRYPTED_MEMO_SIZE, bytesToBjjScalar } from './memoFormat';

// Payment slip: the sealed handoff a sender gives a recipient to skip scanning.
export {
    sealPaymentSlip,
    openPaymentSlip,
    encodePaymentSlip,
    decodePaymentSlip,
    PAYMENT_SLIP_SCHEME,
    // The QR capacity a slip's wire format must fit under — consumed by any
    // wallet or test that renders/validates a slip as a single QR code.
    QR_SINGLE_CODE_MAX_CHARS,
} from './PaymentSlip';
export type { PaymentSlipFields } from './PaymentSlip';
