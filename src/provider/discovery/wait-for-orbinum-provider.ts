import type { OrbinumProvider } from '../orbinum/orbinum-provider';
import { getPageWindow } from '../page/get-page-window';
import { getOrbinumProvider } from './get-orbinum-provider';
import { ORBINUM_INITIALIZED_EVENT } from './orbinum-initialized-event';

/**
 * `window.orbinum`, waiting up to `timeoutMs` for the wallet to inject it: a dapp's
 * script can run before the wallet's. Null when it does not appear in time, or there
 * is no page.
 */
export function waitForOrbinumProvider(
    options: { timeoutMs?: number } = {}
): Promise<OrbinumProvider | null> {
    const present = getOrbinumProvider();
    const page = getPageWindow();
    if (present !== null || page === null) return Promise.resolve(present);
    return new Promise((resolve) => {
        const done = () => {
            clearTimeout(timer);
            page.removeEventListener(ORBINUM_INITIALIZED_EVENT, done);
            resolve(getOrbinumProvider());
        };
        const timer = setTimeout(done, options.timeoutMs ?? 3000);
        page.addEventListener(ORBINUM_INITIALIZED_EVENT, done);
    });
}
