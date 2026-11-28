import type { Eip1193EventMap, Eip1193EventName } from './eip1193-events';
import type { RequestArguments } from './request-arguments';

/**
 * An EIP-1193 provider: what viem's `custom()` transport and ethers'
 * `BrowserProvider` take. Orbinum Wallet's is announced through EIP-6963 and is
 * also `window.orbinum.ethereum`.
 */
export interface Eip1193Provider {
    request(args: RequestArguments): Promise<unknown>;
    on<E extends Eip1193EventName>(event: E, listener: (payload: Eip1193EventMap[E]) => void): void;
    removeListener<E extends Eip1193EventName>(
        event: E,
        listener: (payload: Eip1193EventMap[E]) => void
    ): void;
}
