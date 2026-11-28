/**
 * Dispatched on `window` once `window.orbinum` exists. A dapp whose script ran first
 * waits for it rather than concluding the wallet is not installed.
 */
export const ORBINUM_INITIALIZED_EVENT = 'orbinum#initialized';
