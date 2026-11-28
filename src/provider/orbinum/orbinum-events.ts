import type { ProviderRpcErrorShape } from '../errors/provider-rpc-error';
import type { OrbinumAccount } from './orbinum-account';
import type { OrbinumChainInfo } from './orbinum-chain-info';
import type { OrbinumPermissions } from './orbinum-permissions';

/** `window.orbinum`'s events and what each listener receives. */
export interface OrbinumEventMap {
    connect: OrbinumChainInfo;
    disconnect: ProviderRpcErrorShape;
    /** The accounts this origin may now use; empty once the user disconnects it. */
    accountsChanged: OrbinumAccount[];
    chainChanged: OrbinumChainInfo;
    permissionsChanged: OrbinumPermissions;
}

export type OrbinumEventName = keyof OrbinumEventMap;
