/**
 * Size bounds on what a page may send. A request crosses into the wallet from a page
 * it does not trust; these keep one request from costing more than it is worth to
 * read, before any of it is shown to the user.
 */

/** Most UTF-8 bytes a message to sign may have (`orbinum_signMessage`, `personal_sign`). */
export const MAX_SIGN_MESSAGE_BYTES = 16 * 1024;
/** Most characters of an `eth_signTypedData_v4` payload. */
export const MAX_TYPED_DATA_CHARS = 64 * 1024;
/** Most calldata or init code of an `eth_sendTransaction`, in bytes. */
export const MAX_TRANSACTION_DATA_BYTES = 128 * 1024;
/** The largest planck amount the chain stores (`u128`). */
export const MAX_PLANCK = (1n << 128n) - 1n;
