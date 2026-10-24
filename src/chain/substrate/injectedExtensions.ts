/**
 * Browser wallet extensions, for hosts that actually have a page to inject into.
 *
 * `polkadot-api/pjs-signer` reads a bare `window.injectedWeb3` — correct for a
 * dApp in a tab, and a `ReferenceError` everywhere else this SDK runs: React
 * Native, Node, a Cloudflare Worker, and the surprising one, an extension's own
 * service worker. A crash instead of "no extension is reachable".
 *
 * These wrappers turn that into an ordinary checkable condition, so a host can
 * branch to its own signing path.
 *
 * One change to what an extension hands back: an ed25519 account's `txCreator`
 * signs the readable transaction text (`getEd25519TextSigner`), the only ed25519
 * signature runtime spec 20 accepts. The extension's own creator signs the raw
 * payload, which the runtime refuses; swapping it here means no consumer can
 * forget to.
 *
 * Public, and it belongs beside `getSubstrateSignerFromExtension`: connecting a
 * browser wallet is step one of any dapp and touches no key — the extension
 * holds the key and hands back a handle. It lived in the custody package while
 * that signer's own doc said "pair with `hasInjectedExtensions()`", which an
 * external consumer could not do, because the function it named was not in the
 * package it was named from.
 */
import {
    connectInjectedExtension as pjsConnect,
    getInjectedExtensions as pjsGetExtensions,
} from 'polkadot-api/pjs-signer';
import type { InjectedExtension, InjectedPolkadotAccount } from 'polkadot-api/pjs-signer';
import { getEd25519TextSigner } from './ed25519Text/index';

/**
 * Whether browser wallet extensions can be discovered at all. A host that gets
 * false must sign some other way — there is no fallback to arrange here.
 */
export function hasInjectedExtensions(): boolean {
    // Through `globalThis`, never naming `window`: that name is `lib.dom`, and
    // this module compiles for hosts that have neither the lib nor the object.
    const host = (globalThis as { window?: { injectedWeb3?: unknown } }).window;
    return host !== undefined && host.injectedWeb3 !== undefined;
}

const NO_PAGE =
    'No browser wallet extensions available: this environment has no `window.injectedWeb3`. ' +
    'Check hasInjectedExtensions() first, and use a keypair signer (getSubstrateSigner) off-page.';

/**
 * Installed extension ids, or an empty list where none can exist.
 *
 * Empty rather than a throw: off-page, "which extensions are present" has an
 * honest answer, and it is "none". A caller rendering a picker wants a list.
 */
export function getInjectedExtensions(): string[] {
    if (!hasInjectedExtensions()) return [];
    return pjsGetExtensions();
}

/**
 * Connects to one extension by id. Throws off-page, unlike the enumerator: the
 * caller named an extension, so silence would misreport "not installed" for
 * "this host cannot reach extensions at all".
 */
export async function connectInjectedExtension(
    name: string,
    origin?: string
): Promise<InjectedExtension> {
    if (!hasInjectedExtensions()) throw new Error(NO_PAGE);
    const extension = await (origin === undefined ? pjsConnect(name) : pjsConnect(name, origin));
    return withTextSigners(extension);
}

/**
 * ed25519 accounts with a `txCreator` that signs the transaction text through the
 * account's own `signBytes` (the wallet's `signRaw`); every other account as is.
 */
function withTextSigners(extension: InjectedExtension): InjectedExtension {
    // Keyed by the extension's account object, so repeated reads hand back the same signer.
    const swapped = new WeakMap<InjectedPolkadotAccount, InjectedPolkadotAccount>();
    const swapOne = (account: InjectedPolkadotAccount): InjectedPolkadotAccount => {
        if (account.type !== 'ed25519') return account;
        let text = swapped.get(account);
        if (!text) {
            const txCreator = getEd25519TextSigner(account.address, account.txCreator.signBytes);
            text = { ...account, txCreator };
            swapped.set(account, text);
        }
        return text;
    };
    const swap = (accounts: InjectedPolkadotAccount[]) => accounts.map(swapOne);
    return {
        ...extension,
        getAccounts: () => swap(extension.getAccounts()),
        subscribe: (cb) => extension.subscribe((accounts) => cb(swap(accounts))),
    };
}
