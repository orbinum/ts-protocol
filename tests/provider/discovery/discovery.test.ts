/**
 * Finding the wallet from a dapp, on a page (an `EventTarget` standing in for
 * `window`, which is all the provider uses of it) and off-page.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ORBINUM_INITIALIZED_EVENT,
    getOrbinumEip1193Provider,
    getOrbinumProvider,
    waitForOrbinumProvider,
} from '../../../src/provider/discovery/index';
import {
    ORBINUM_WALLET_RDNS,
    announceEip6963Provider,
    requestEip6963Providers,
} from '../../../src/provider/eip6963/index';
import type { Eip1193Provider } from '../../../src/provider/eip1193/index';
import type { OrbinumProvider } from '../../../src/provider/orbinum/index';

const globals = globalThis as { window?: unknown };
const hadWindow = 'window' in globals;
const realWindow = globals.window;

function page(): EventTarget & { orbinum?: unknown } {
    const target = new EventTarget() as EventTarget & { orbinum?: unknown };
    globals.window = target;
    return target;
}

const ethereum: Eip1193Provider = { request: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
const orbinum = {
    isOrbinum: true,
    ethereum,
    request: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
} as unknown as OrbinumProvider;

const info = (rdns: string, uuid: string) => ({ uuid, name: rdns, icon: 'data:,', rdns });

afterEach(() => {
    if (hadWindow) globals.window = realWindow;
    else delete globals.window;
});

describe('off-page', () => {
    it('answers "not here" without throwing', async () => {
        delete globals.window;
        expect(getOrbinumProvider()).toBeNull();
        expect(await waitForOrbinumProvider({ timeoutMs: 10 })).toBeNull();
        expect(await requestEip6963Providers({ timeoutMs: 10 })).toEqual([]);
        expect(await getOrbinumEip1193Provider({ timeoutMs: 10 })).toBeNull();
        expect(() =>
            announceEip6963Provider({ info: info('x', '1'), provider: ethereum })()
        ).not.toThrow();
    });
});

describe('window.orbinum', () => {
    it('is found once present, and only when it looks like the wallet', () => {
        const target = page();
        expect(getOrbinumProvider()).toBeNull();
        target.orbinum = { request: () => {} };
        expect(getOrbinumProvider()).toBeNull();
        target.orbinum = orbinum;
        expect(getOrbinumProvider()).toBe(orbinum);
    });

    it('is waited for until the wallet says it is initialized', async () => {
        const target = page();
        const found = waitForOrbinumProvider({ timeoutMs: 1000 });
        target.orbinum = orbinum;
        target.dispatchEvent(new Event(ORBINUM_INITIALIZED_EVENT));
        expect(await found).toBe(orbinum);
    });

    it('resolves null when the wallet never comes', async () => {
        page();
        expect(await waitForOrbinumProvider({ timeoutMs: 20 })).toBeNull();
    });
});

describe('EIP-6963', () => {
    it('announces on request, frozen, and finds Orbinum by rdns among other wallets', async () => {
        page();
        const stopOrbinum = announceEip6963Provider({
            info: info(ORBINUM_WALLET_RDNS, 'a'),
            provider: ethereum,
        });
        const other: Eip1193Provider = { request: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
        const stopOther = announceEip6963Provider({ info: info('io.other', 'b'), provider: other });
        const found = await requestEip6963Providers({ timeoutMs: 10 });
        expect(found.map((d) => d.info.rdns).sort()).toEqual(
            [ORBINUM_WALLET_RDNS, 'io.other'].sort()
        );
        expect(Object.isFrozen(found[0])).toBe(true);
        expect(Object.isFrozen(found[0]!.info)).toBe(true);
        expect(await getOrbinumEip1193Provider({ timeoutMs: 10 })).toBe(ethereum);
        stopOrbinum();
        stopOther();
        expect(await requestEip6963Providers({ timeoutMs: 10 })).toEqual([]);
    });

    it('ignores an announcement that is not shaped like one', async () => {
        const target = page();
        target.addEventListener('eip6963:requestProvider', () => {
            target.dispatchEvent(
                new CustomEvent('eip6963:announceProvider', { detail: { info: { rdns: 'x' } } })
            );
        });
        expect(await requestEip6963Providers({ timeoutMs: 10 })).toEqual([]);
    });

    it('falls back to window.orbinum.ethereum when nothing is announced', async () => {
        page().orbinum = orbinum;
        expect(await getOrbinumEip1193Provider({ timeoutMs: 10 })).toBe(ethereum);
    });
});
