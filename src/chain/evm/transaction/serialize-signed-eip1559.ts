import { toHex } from '../../../foundation/encoding/hex';
import { concatBytes } from './concat-bytes';
import { eip1559Fields } from './eip1559-fields';
import { EIP1559_TRANSACTION_TYPE } from './eip1559-signing-hash';
import type { Eip1559Signature, Eip1559Transaction } from './eip1559-transaction';
import { quantityBytes } from './quantity-bytes';
import { rlpEncode } from './rlp-encode';

/** secp256k1's group order: a valid `r` and `s` are below it. */
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/**
 * `tx` and its signature as the raw transaction `eth_sendRawTransaction` takes:
 * `0x02 ‖ rlp(fields ‖ yParity ‖ r ‖ s)`, hex.
 *
 * `s` must be in the lower half of the order (EIP-2): nodes refuse the other half,
 * and a signer that does not normalise is a bug to surface here, not on submit.
 */
export function serializeSignedEip1559(
    tx: Eip1559Transaction,
    signature: Eip1559Signature
): string {
    const { r, s, yParity } = signature;
    if (r <= 0n || r >= SECP256K1_N) throw new Error('signature.r: out of range');
    if (s <= 0n || s > SECP256K1_N / 2n) throw new Error('signature.s: must be low-s (EIP-2)');
    if (yParity !== 0 && yParity !== 1) throw new Error('signature.yParity: expected 0 or 1');
    const fields = [
        ...eip1559Fields(tx),
        quantityBytes(BigInt(yParity), 'signature.yParity'),
        quantityBytes(r, 'signature.r'),
        quantityBytes(s, 'signature.s'),
    ];
    return toHex(concatBytes([Uint8Array.of(EIP1559_TRANSACTION_TYPE), rlpEncode(fields)]));
}
