import type { HexString } from '../values/hex-string';

/** The chain the wallet is on, as `orbinum_chain` reports it. */
export interface OrbinumChainInfo {
    /** `Orbinum`, `Orbinum Testnet`, or the dev chain's name. */
    name: string;
    /** Identifies the chain beyond doubt: compare this, not `name`. */
    genesisHash: HexString;
    /** The EIP-155 id EVM transactions are signed for (270 mainnet, 2700 testnet, 42 dev). */
    evmChainId: number;
    ss58Prefix: number;
    token: { symbol: string; decimals: number };
}
