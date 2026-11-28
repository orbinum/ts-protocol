import type { Eip1193Provider } from '../eip1193/eip1193-provider';
import { ORBINUM_WALLET_RDNS } from '../eip6963/orbinum-rdns';
import { requestEip6963Providers } from '../eip6963/request-eip6963-providers';
import { getOrbinumProvider } from './get-orbinum-provider';

/**
 * Orbinum Wallet's EIP-1193 provider, for viem or ethers: found through EIP-6963 by
 * its `rdns`, never by `window.ethereum`, which another wallet may own. Falls back to
 * `window.orbinum.ethereum`; null when the wallet is not on the page.
 */
export async function getOrbinumEip1193Provider(
    options: { timeoutMs?: number } = {}
): Promise<Eip1193Provider | null> {
    const announced = await requestEip6963Providers(options);
    const orbinum = announced.find((detail) => detail.info.rdns === ORBINUM_WALLET_RDNS);
    return orbinum?.provider ?? getOrbinumProvider()?.ethereum ?? null;
}
