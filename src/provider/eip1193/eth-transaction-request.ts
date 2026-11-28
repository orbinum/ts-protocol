import type { HexString } from '../values/hex-string';

/**
 * The transaction a dapp hands `eth_sendTransaction`: quantities as hex (EIP-1474).
 * The wallet fills what is left out (nonce, gas, fees) and shows the result to the
 * user before signing.
 */
export interface EthTransactionRequest {
    /** The sending account: must be the one this origin is connected with. */
    from: HexString;
    /** Absent to deploy `data` as a contract. */
    to?: HexString;
    value?: HexString;
    data?: HexString;
    /** Some libraries send calldata as `input`; it must equal `data` when both are given. */
    input?: HexString;
    gas?: HexString;
    maxFeePerGas?: HexString;
    maxPriorityFeePerGas?: HexString;
    /** Legacy pricing: read as both fee caps of a type-2 transaction. */
    gasPrice?: HexString;
    nonce?: HexString;
    chainId?: HexString;
}
