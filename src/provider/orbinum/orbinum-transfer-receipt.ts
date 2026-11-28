import type { HexString } from '../values/hex-string';

/** A transaction the wallet submitted, once it is in a block. */
export interface OrbinumTransferReceipt {
    txHash: HexString;
    blockHash: HexString;
    blockNumber: number;
}
