/**
 * The error codes a provider answers with: EIP-1193's provider errors and EIP-1474's
 * JSON-RPC ones. The same numbers on `window.orbinum` and on the EIP-1193 provider, so
 * a dapp handles a rejection one way whichever it called.
 */
export const PROVIDER_ERROR_CODES = {
    /** The user rejected the request in the wallet. */
    userRejected: 4001,
    /** This origin has not been granted what it asked for: connect first. */
    unauthorized: 4100,
    /** The wallet does not implement the method. */
    unsupportedMethod: 4200,
    /** The wallet cannot reach any chain. */
    disconnected: 4900,
    /** The wallet cannot reach the requested chain. */
    chainDisconnected: 4901,
    /** `wallet_switchEthereumChain` to a chain the wallet does not offer. */
    unrecognizedChain: 4902,
    /** The params are malformed. */
    invalidParams: -32602,
    /** The wallet failed on its side. */
    internal: -32603,
} as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[keyof typeof PROVIDER_ERROR_CODES];
