/**
 * A type-2 (EIP-1559) transaction: what a wallet signs to call or pay from an EVM
 * account. Amounts in wei, which on Orbinum is planck (18 decimals).
 */

/** One entry of an EIP-2930 access list. */
export interface AccessListEntry {
    /** 20-byte address, `0x`-prefixed. */
    address: string;
    /** 32-byte storage keys, `0x`-prefixed. */
    storageKeys: string[];
}

export interface Eip1559Transaction {
    /** The chain's EIP-155 id (`eth_chainId`): it binds the signature to one chain. */
    chainId: bigint;
    nonce: bigint;
    maxPriorityFeePerGas: bigint;
    maxFeePerGas: bigint;
    /** The gas limit. */
    gas: bigint;
    /** 20-byte address, `0x`-prefixed; `null` deploys `data` as a contract. */
    to: string | null;
    value: bigint;
    /** Calldata (or init code), `0x`-prefixed hex; `'0x'` for none. */
    data: string;
    accessList?: AccessListEntry[];
}

/** The signature over `eip1559SigningHash`, as secp256k1 gives it. */
export interface Eip1559Signature {
    r: bigint;
    s: bigint;
    /** The recovery bit. A type-2 transaction carries it as is, not as EIP-155 `v`. */
    yParity: 0 | 1;
}
