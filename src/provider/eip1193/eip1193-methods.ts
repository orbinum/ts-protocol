/**
 * The EIP-1193 methods Orbinum Wallet answers, by what they cost the user.
 *
 * `reads` are forwarded to the wallet's node as they are: public chain state, no
 * account, no approval. Everything else is answered by the wallet itself, and
 * `transactions` and `signing` always ask the user first. A method on none of these
 * lists is refused with `unsupportedMethod` (4200), never forwarded: forwarding an
 * unknown method would let a page reach whatever the node exposes.
 */
export const ORBINUM_EIP1193_METHODS = {
    accounts: ['eth_requestAccounts', 'eth_accounts'],
    chain: ['eth_chainId', 'net_version'],
    transactions: ['eth_sendTransaction'],
    signing: ['personal_sign', 'eth_signTypedData_v4'],
    wallet: [
        'wallet_switchEthereumChain',
        'wallet_requestPermissions',
        'wallet_getPermissions',
        'wallet_revokePermissions',
    ],
    reads: [
        'eth_blockNumber',
        'eth_call',
        'eth_estimateGas',
        'eth_feeHistory',
        'eth_gasPrice',
        'eth_getBalance',
        'eth_getBlockByHash',
        'eth_getBlockByNumber',
        'eth_getCode',
        'eth_getLogs',
        'eth_getStorageAt',
        'eth_getTransactionByHash',
        'eth_getTransactionCount',
        'eth_getTransactionReceipt',
        'eth_maxPriorityFeePerGas',
    ],
} as const;

type Groups = typeof ORBINUM_EIP1193_METHODS;

/** A method Orbinum Wallet answers on its EIP-1193 provider. */
export type OrbinumEip1193Method = Groups[keyof Groups][number];

/** A method forwarded to the node: public state, no approval. */
export type Eip1193ReadMethod = Groups['reads'][number];
