/**
 * `orbinum-verify.wasm`'s logic (`wasm/handle.ts`) and its stdin/stdout glue
 * (`wasm/main.ts`), run here as TypeScript: the module adds nothing but I/O, so
 * what passes here is what a Python or Go backend gets.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handle } from '../../wasm/handle';
import { commitmentLeafIndexKey } from '../../src/protocol/payment/finalizedLeaf';
import { ADDRESS, PROOF_VECTORS, proofVector } from '../protocol/payment/vectors';

describe('handle (the module’s answer)', () => {
    for (const v of PROOF_VECTORS) {
        it(`${v.name}`, () => {
            const value = v.expected?.value ?? '1';
            const out = handle({
                proof: v.proof,
                address: ADDRESS,
                value,
                assetId: v.expected?.assetId ?? '0',
            });
            if (v.expected) {
                expect(out).toMatchObject({
                    ok: true,
                    payment: {
                        value: v.expected.value,
                        assetId: v.expected.assetId,
                        sender: v.expected.sender,
                    },
                });
            } else {
                expect(out).toEqual({ ok: false, reason: 'invalid-proof' });
            }
        });
    }

    it('a valid proof comes with the storage key to read in the finalized chain', () => {
        const v = proofVector('anonymous');
        const out = handle({ proof: v.proof, address: ADDRESS, value: '1500', assetId: '0' }) as {
            payment: { commitmentHex: string };
            storageKey: string;
        };
        expect(out.storageKey).toBe(commitmentLeafIndexKey(out.payment.commitmentHex));
        expect(
            handle({ proof: v.proof, address: ADDRESS, value: '1', assetId: '0' })
        ).not.toHaveProperty('storageKey');
    });

    it('amounts travel as decimal strings, never floats', () => {
        const v = proofVector('other-asset-big-value');
        const out = handle({
            proof: v.proof,
            address: ADDRESS,
            value: v.expected!.value,
            assetId: '7',
        });
        expect(JSON.stringify(out)).toContain(`"value":"${v.expected!.value}"`);
    });

    it('names a wrong amount or asset', () => {
        const proof = proofVector('anonymous').proof;
        expect(handle({ proof, address: ADDRESS, value: '1501', assetId: '0' })).toMatchObject({
            ok: false,
            reason: 'wrong-amount',
        });
        expect(handle({ proof, address: ADDRESS, value: '1500', assetId: '3' })).toMatchObject({
            ok: false,
            reason: 'wrong-asset',
        });
    });

    it('a malformed REQUEST is an error, never a refused customer', () => {
        const proof = proofVector('anonymous').proof;
        for (const bad of [
            null,
            'x',
            { address: ADDRESS, value: '1' },
            { proof, value: '1' },
            { proof, address: ADDRESS, value: 1500 },
            { proof, address: ADDRESS, value: '1.5' },
            { proof, address: ADDRESS, value: '-1' },
            { proof, address: ADDRESS, value: '0' },
            { proof, address: ADDRESS, value: '1', assetId: '4294967296' },
            { proof, address: 'orbpriv3:nope', value: '1' },
        ]) {
            expect(handle(bad), JSON.stringify(bad)).toHaveProperty('error');
        }
    });

    it('a hostile proof is a refusal, not a crash', () => {
        for (const proof of ['', 'orbproof1:', '\u0000'.repeat(100), 'x'.repeat(100_000)]) {
            expect(handle({ proof, address: ADDRESS, value: '1', assetId: '0' })).toEqual({
                ok: false,
                reason: 'invalid-proof',
            });
        }
    });
});

describe('main (stdin → stdout, as the WASI module runs it)', () => {
    afterEach(() => {
        delete (globalThis as { Javy?: unknown }).Javy;
        vi.resetModules();
    });

    /** Runs `wasm/main.ts` once with `input` on a fake stdin; returns what it wrote. */
    async function run(input: Uint8Array): Promise<unknown> {
        let offset = 0;
        let written = '';
        (globalThis as { Javy?: unknown }).Javy = {
            IO: {
                readSync(_fd: number, buffer: Uint8Array) {
                    const n = Math.min(buffer.length, input.length - offset);
                    buffer.set(input.subarray(offset, offset + n));
                    offset += n;
                    return n;
                },
                writeSync(_fd: number, buffer: Uint8Array) {
                    written += new TextDecoder().decode(buffer);
                    return buffer.length;
                },
            },
        };
        await import('../../wasm/main');
        return JSON.parse(written);
    }
    const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

    it('answers a request read in several chunks', async () => {
        const v = proofVector('pseudonym');
        expect(
            await run(json({ proof: v.proof, address: ADDRESS, value: '2500', assetId: '0' }))
        ).toMatchObject({
            ok: true,
            payment: { sender: { kind: 'pseudonym', name: 'CoffeeShop' } },
        });
    });

    it('refuses input that is not JSON', async () => {
        expect(await run(new TextEncoder().encode('{nope'))).toEqual({
            error: 'input is not JSON',
        });
    });

    it('refuses oversized input without parsing it', async () => {
        expect(await run(new Uint8Array(20_000).fill(0x20))).toEqual({
            error: 'input larger than 16384 bytes',
        });
    });
});

describe('atob (the WASI module’s polyfill)', () => {
    it('decodes like the platform’s, padded or not', async () => {
        const { atob: polyfill } = await import('../../wasm/atob');
        for (const text of ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar', 'ÿ\u0000\u0080abc']) {
            const b64 = btoa(text);
            expect(polyfill(b64)).toBe(text);
            expect(polyfill(b64.replace(/=+$/, ''))).toBe(text);
        }
    });

    it('refuses what is not base64', async () => {
        const { atob: polyfill } = await import('../../wasm/atob');
        for (const bad of ['a', 'ab$c', 'a-b_']) expect(() => polyfill(bad)).toThrow();
    });
});
