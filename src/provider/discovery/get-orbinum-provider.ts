import type { OrbinumProvider } from '../orbinum/orbinum-provider';
import { getPageWindow } from '../page/get-page-window';

/**
 * `window.orbinum`, or null when Orbinum Wallet is not on this page (or there is no
 * page). Never throws: "not installed" is an answer, and the dapp chooses what to show.
 */
export function getOrbinumProvider(): OrbinumProvider | null {
    const candidate = getPageWindow()?.orbinum;
    if (typeof candidate !== 'object' || candidate === null) return null;
    const provider = candidate as Partial<OrbinumProvider>;
    return provider.isOrbinum === true && typeof provider.request === 'function'
        ? (candidate as OrbinumProvider)
        : null;
}
