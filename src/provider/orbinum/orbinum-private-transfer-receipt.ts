import type { HexString } from '../values/hex-string';

/** A private payment, landed. */
export interface OrbinumPrivateTransferReceipt {
    txHash: HexString;
    /**
     * The `orbproof1:` proof of this one payment: the merchant's backend checks it with
     * `verifyPaymentProof` and its own public address. It is a bearer token — send it
     * only to the server that created the order it pays.
     */
    paymentProof: string;
}
