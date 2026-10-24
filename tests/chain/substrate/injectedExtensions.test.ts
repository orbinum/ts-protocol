/**
 * Extension discovery off-page.
 *
 * `polkadot-api/pjs-signer` reads a bare `window.injectedWeb3`. That is right
 * for a dApp in a tab and wrong in every other host this SDK targets — React
 * Native, Node, a Cloudflare Worker, and an extension's own service worker,
 * which has `self` but no `window`. Unwrapped, the call dies with
 * `ReferenceError: window is not defined`, which tells a developer nothing
 * about what to do instead.
 *
 * These tests pin the two different answers the wrappers give: enumeration
 * returns an empty list (off-page, "none installed" is honest), while a
 * connection request rejects (the caller named an extension, and reporting
 * "not installed" would hide that no extension is reachable at all).
 *
 * On a page, a connected extension's ed25519 accounts carry the text signer.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AccountId } from '@polkadot-api/substrate-bindings';
import {
    hasInjectedExtensions,
    getInjectedExtensions,
    connectInjectedExtension,
} from '../../../src/chain/substrate/injectedExtensions';

const textSigner = vi.hoisted(() => vi.fn());
vi.mock('../../../src/chain/substrate/ed25519Text/index', () => ({
    getEd25519TextSigner: textSigner,
}));

const globals = globalThis as { window?: unknown };
const hadWindow = 'window' in globals;
const realWindow = globals.window;

function setWindow(value: unknown): void {
    globals.window = value;
}

afterEach(() => {
    if (hadWindow) globals.window = realWindow;
    else delete globals.window;
});

describe('hasInjectedExtensions', () => {
    it('is false with no window at all — Node, RN, a Cloudflare Worker', () => {
        delete globals.window;
        expect(hasInjectedExtensions()).toBe(false);
    });

    it('is false in a window without injectedWeb3 — an extension service worker', () => {
        setWindow({});
        expect(hasInjectedExtensions()).toBe(false);
    });

    it('is true once a wallet extension has injected', () => {
        setWindow({ injectedWeb3: { talisman: {} } });
        expect(hasInjectedExtensions()).toBe(true);
    });

    it('is false when injectedWeb3 is present but undefined', () => {
        // An extension that declares the key without filling it has injected
        // nothing usable, and pjs-signer would destructure undefined.
        setWindow({ injectedWeb3: undefined });
        expect(hasInjectedExtensions()).toBe(false);
    });
});

describe('getInjectedExtensions', () => {
    it('returns an empty list off-page instead of throwing', () => {
        // A host enumerating wallets to render a picker wants a list. "None"
        // is the true answer where extensions cannot exist.
        delete globals.window;
        expect(getInjectedExtensions()).toEqual([]);
    });

    it('does not throw a ReferenceError — the failure this wrapper exists for', () => {
        delete globals.window;
        expect(() => getInjectedExtensions()).not.toThrow();
    });
});

describe('connectInjectedExtension', () => {
    it('rejects off-page rather than reporting "not installed"', async () => {
        delete globals.window;
        await expect(connectInjectedExtension('talisman')).rejects.toThrow(
            /No browser wallet extensions available/
        );
    });

    it('names hasInjectedExtensions in the error, so the fix is actionable', async () => {
        delete globals.window;
        await expect(connectInjectedExtension('talisman')).rejects.toThrow(/hasInjectedExtensions/);
    });

    it('rejects rather than throwing synchronously', () => {
        // The upstream signature returns a promise; a caller with only .catch()
        // would otherwise miss the error entirely.
        delete globals.window;
        const result = connectInjectedExtension('talisman');
        expect(result).toBeInstanceOf(Promise);
        return expect(result).rejects.toThrow();
    });
});

describe('connectInjectedExtension on a page', () => {
    const ED = AccountId(42).dec(new Uint8Array(32).fill(1));
    const SR = AccountId(42).dec(new Uint8Array(32).fill(2));

    /** A pjs extension whose account list can change after connecting. */
    function injectExtension(accounts: { address: string; type: string }[]) {
        const signRaw = vi.fn(async () => ({ id: 1, signature: '0x' + '11'.repeat(64) }));
        let notify: (accounts: unknown[]) => void = () => {};
        setWindow({
            injectedWeb3: {
                talisman: {
                    enable: async () => ({
                        accounts: {
                            get: async () => accounts,
                            subscribe: (cb: (a: unknown[]) => void) => {
                                notify = cb;
                                return () => {};
                            },
                        },
                        signer: { signPayload: vi.fn(), signRaw },
                    }),
                },
            },
        });
        return { signRaw, update: (next: unknown[]) => notify(next) };
    }

    it('gives ed25519 accounts the text signer, over the account’s own signBytes', async () => {
        textSigner.mockReset().mockImplementation(() => ({ kind: 'text-signer' }));
        const { signRaw } = injectExtension([
            { address: ED, type: 'ed25519' },
            { address: SR, type: 'sr25519' },
        ]);
        const [ed, sr] = (await connectInjectedExtension('talisman')).getAccounts();

        expect(ed?.txCreator).toEqual({ kind: 'text-signer' });
        expect(textSigner).toHaveBeenCalledTimes(1);
        const [address, signBytes] = textSigner.mock.calls[0]!;
        expect(address).toBe(ED);
        await signBytes(Uint8Array.of(0xab));
        expect(signRaw).toHaveBeenCalledWith({ address: ED, data: '0xab', type: 'bytes' });

        expect(sr?.txCreator).not.toEqual({ kind: 'text-signer' });
        expect(typeof sr?.txCreator).toBe('function');
    });

    it('hands back the same signer on every read', async () => {
        textSigner.mockReset().mockImplementation(() => ({ kind: 'text-signer' }));
        injectExtension([{ address: ED, type: 'ed25519' }]);
        const extension = await connectInjectedExtension('talisman');
        expect(extension.getAccounts()[0]).toBe(extension.getAccounts()[0]);
        expect(textSigner).toHaveBeenCalledTimes(1);
    });

    it('swaps ed25519 accounts that arrive through subscribe', async () => {
        textSigner.mockReset().mockImplementation(() => ({ kind: 'text-signer' }));
        const { update } = injectExtension([]);
        const extension = await connectInjectedExtension('talisman');
        const seen = vi.fn();
        extension.subscribe(seen);
        update([{ address: ED, type: 'ed25519' }]);
        expect(seen.mock.calls[0]![0][0].txCreator).toEqual({ kind: 'text-signer' });
    });
});
