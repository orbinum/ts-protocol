/**
 * `@orbinum/protocol/browser`: connecting a browser wallet extension.
 *
 * Kept out of the root entry so a Node host never loads `polkadot-api/pjs-signer`.
 * Every function is guarded: off-page it reports "no extension" instead of throwing on
 * a missing `window`.
 */
export {
    hasInjectedExtensions,
    getInjectedExtensions,
    connectInjectedExtension,
} from './chain/substrate/injectedExtensions';
/** From a browser wallet extension. Pair with `hasInjectedExtensions()`. */
export { getTxCreatorFromPjs as getSubstrateSignerFromExtension } from 'polkadot-api/pjs-signer';
export type { SignPayload, SignRaw } from 'polkadot-api/pjs-signer';
