import { keccak_256 } from '@noble/hashes/sha3.js';
import { concatBytes } from './concat-bytes';
import { eip1559Fields } from './eip1559-fields';
import type { Eip1559Transaction } from './eip1559-transaction';
import { rlpEncode } from './rlp-encode';

/** The EIP-2718 type byte of an EIP-1559 transaction. */
export const EIP1559_TRANSACTION_TYPE = 0x02;

/**
 * The 32 bytes a wallet signs for `tx`: `keccak256(0x02 ‖ rlp(fields))`. Signed with
 * the account's secp256k1 key, it gives the `r`, `s` and `yParity` that
 * `serializeSignedEip1559` appends.
 */
export function eip1559SigningHash(tx: Eip1559Transaction): Uint8Array {
    return keccak_256(
        concatBytes([Uint8Array.of(EIP1559_TRANSACTION_TYPE), rlpEncode(eip1559Fields(tx))])
    );
}
