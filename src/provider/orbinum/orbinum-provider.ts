import type { Eip1193Provider } from '../eip1193/eip1193-provider';
import type { OrbinumEventMap, OrbinumEventName } from './orbinum-events';
import type { OrbinumMethod, OrbinumMethods } from './orbinum-methods';

/** A request to `window.orbinum`, typed by method: `params` only where the method has any. */
export type OrbinumRequest<M extends OrbinumMethod> = OrbinumMethods[M]['params'] extends undefined
    ? { method: M; params?: undefined }
    : { method: M; params: OrbinumMethods[M]['params'] };

/**
 * `window.orbinum`: Orbinum Wallet's provider. Requests reject with a
 * `ProviderRpcError` shape (`providerRpcErrorOf` reads it): 4001 when the user
 * declines, 4100 before the origin is connected.
 */
export interface OrbinumProvider {
    readonly isOrbinum: true;
    /** The same wallet as an EIP-1193 provider, for viem or ethers; also announced through EIP-6963. */
    readonly ethereum: Eip1193Provider;
    request<M extends OrbinumMethod>(args: OrbinumRequest<M>): Promise<OrbinumMethods[M]['result']>;
    on<E extends OrbinumEventName>(event: E, listener: (payload: OrbinumEventMap[E]) => void): void;
    removeListener<E extends OrbinumEventName>(
        event: E,
        listener: (payload: OrbinumEventMap[E]) => void
    ): void;
}
