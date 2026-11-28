import type { ProviderRpcErrorShape } from '../errors/provider-rpc-error';

/** `connect`: the chain the provider reached, as an EIP-155 id in hex. */
export interface ProviderConnectInfo {
    readonly chainId: string;
}

/** `message`: a notification, such as an `eth_subscription` result. */
export interface ProviderMessage {
    readonly type: string;
    readonly data: unknown;
}

/** EIP-1193's events and what each listener receives. */
export interface Eip1193EventMap {
    connect: ProviderConnectInfo;
    disconnect: ProviderRpcErrorShape;
    /** The new chain's id, in hex. */
    chainChanged: string;
    /** The accounts this origin may now use, first the selected one; empty when disconnected. */
    accountsChanged: string[];
    message: ProviderMessage;
}

export type Eip1193EventName = keyof Eip1193EventMap;
