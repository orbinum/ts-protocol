/**
 * `orbinum_signMessage`: the connected account signs `message`, which the user
 * reads in full before approving. Signed as `<Bytes>message</Bytes>`, the
 * Substrate convention that keeps a signed message from ever being a valid
 * transaction — with the account's own key (see `OrbinumSignature.scheme`).
 */
export interface OrbinumSignMessageParams {
    /** UTF-8 text, at most 16 KiB. */
    message: string;
}
