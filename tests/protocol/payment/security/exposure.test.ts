/**
 * What a developer's backend gets from payment verification — and what it must
 * never get. Results carry only checked facts (commitment, amount, asset,
 * declared sender); no key material, memo, blinding or shared secret ever
 * reaches a result, an error message or the WASI module's output, where it
 * would end up in logs. And one payment has exactly one identity to key an
 * order on.
 */
import { describe, expect, it } from 'vitest';
import {
    BN254_R,
    bigintTo32Le,
    bytesToBigintLE,
    decodePaymentSlip,
    encodePaymentSlip,
    fromHex,
    openPaymentSlip,
    sealPaymentSlip,
    toHex,
} from '../../../../src';
import {
    checkPaymentProof,
    decodePaymentProof,
    decodeViewingKey,
    encodePaymentProof,
    encodeViewingKey,
    readPaymentSlip,
    verifyPayment,
    verifyPaymentProof,
} from '../../../../src/protocol/payment';
import { handle } from '../../../../wasm/handle';
import { ADDRESS, KEY, RECIPIENT_IVK, VECTORS, proofVector, vector } from '../vectors';

const tree = {
    getFinalizedLeafIndex: async () => 3,
    getMerkleProofByCommitment: async () => ({ leafIndex: 3 }),
};
const IVSK_HEX = toHex(KEY.viewingSecretKey).slice(2);
/** The same field element, written as c + r: a different 32-byte string. */
const aliasOf = (commitmentHex: string) =>
    toHex(bigintTo32Le(bytesToBigintLE(fromHex(commitmentHex)) + BN254_R));
const throwsMessage = async (run: () => unknown) => {
    try {
        await run();
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    throw new Error('expected a throw');
};

describe('Threat: one payment settles two orders under two spellings', () => {
    it('a slip naming its commitment as c + r is refused', () => {
        const fields = openPaymentSlip(
            KEY.viewingSecretKey,
            decodePaymentSlip(vector('anonymous').slip)!
        )!;
        const alias = encodePaymentSlip(
            sealPaymentSlip(RECIPIENT_IVK, {
                ...fields,
                commitmentHex: aliasOf(fields.commitmentHex),
            })
        );
        expect(readPaymentSlip(alias, KEY)).toBeNull();
    });

    it('a slip resealed with another txHash is the same payment, and offers no txHash to key on', async () => {
        const fields = openPaymentSlip(
            KEY.viewingSecretKey,
            decodePaymentSlip(vector('anonymous').slip)!
        )!;
        const expected = { value: BigInt(vector('anonymous').expected!.value), assetId: 0n };
        const results = [];
        for (const txHash of ['0x' + '11'.repeat(32), '0x' + '22'.repeat(32)]) {
            const slip = encodePaymentSlip(sealPaymentSlip(RECIPIENT_IVK, { ...fields, txHash }));
            results.push(await verifyPayment(slip, { key: KEY, tree, expected }));
        }
        const [a, b] = results as [{ ok: true; payment: object }, { ok: true; payment: object }];
        expect(a.ok && b.ok).toBe(true);
        expect(a.payment).toEqual(b.payment);
        expect(a.payment).not.toHaveProperty('txHash');
    });

    it('a proof naming its commitment as c + r is refused', () => {
        const p = decodePaymentProof(proofVector('anonymous').proof)!;
        const alias = encodePaymentProof({ ...p, commitmentHex: aliasOf(p.commitmentHex) });
        expect(
            checkPaymentProof(alias, { address: ADDRESS, expected: { value: 1500n, assetId: 0n } })
        ).toEqual({
            ok: false,
            reason: 'invalid-proof',
        });
    });
});

describe('Threat: verification output leaks secrets into the developer’s logs', () => {
    it('a slip’s result is only the checked facts — never the key, memo or note opening', async () => {
        for (const v of VECTORS.filter((c) => c.expected)) {
            const read = readPaymentSlip(v.slip, KEY)!;
            const verified = await verifyPayment(v.slip, {
                key: KEY,
                tree,
                expected: {
                    value: BigInt(v.expected!.value) || 1n,
                    assetId: BigInt(v.expected!.assetId),
                },
            });
            for (const result of [read, verified]) {
                const text = JSON.stringify(result, (_, x) =>
                    typeof x === 'bigint' ? x.toString() : x
                );
                expect(text).not.toContain(IVSK_HEX);
                expect(text).not.toMatch(/blinding|memo|sharedSecret|viewingSecretKey|spending/i);
            }
            expect(
                Object.keys(read)
                    .filter((k) => !['leafIndex', 'txHash'].includes(k))
                    .sort()
            ).toEqual(['assetId', 'commitmentHex', 'sender', 'value']);
        }
    });

    it('a proof’s result never echoes the ephemeral secret key or the memo', async () => {
        const p = decodePaymentProof(proofVector('pseudonym').proof)!;
        const outputs = [
            checkPaymentProof(proofVector('pseudonym').proof, {
                address: ADDRESS,
                expected: { value: 2500n, assetId: 0n },
            }),
            checkPaymentProof(proofVector('pseudonym').proof, {
                address: ADDRESS,
                expected: { value: 1n, assetId: 0n },
            }),
            await verifyPaymentProof(proofVector('pseudonym').proof, {
                address: ADDRESS,
                tree,
                expected: { value: 2500n, assetId: 0n },
            }),
            handle({ proof: proofVector('pseudonym').proof, address: ADDRESS, value: '2500' }),
        ];
        for (const out of outputs) {
            const text = JSON.stringify(out, (_, x) => (typeof x === 'bigint' ? x.toString() : x));
            expect(text).not.toContain(p.ephemeralSecretKey.slice(2));
            expect(text).not.toContain(p.encryptedMemo.slice(2, 66));
        }
    });

    it('error messages never carry the viewing key', async () => {
        const messages = [
            await throwsMessage(() =>
                readPaymentSlip(vector('anonymous').slip, { ...KEY, ownerPk: BN254_R })
            ),
            await throwsMessage(() =>
                verifyPayment(vector('anonymous').slip, {
                    key: KEY,
                    tree,
                    expected: { value: 0n, assetId: 0n },
                })
            ),
            await throwsMessage(() => encodeViewingKey({ ...KEY, ownerPk: 0n })),
        ];
        for (const message of messages) expect(message).not.toContain(IVSK_HEX);
    });

    it('a mistyped viewing key is null, not an error that quotes it', () => {
        const text = encodeViewingKey(KEY);
        expect(decodeViewingKey(text.slice(0, -1) + (text.endsWith('0') ? '1' : '0'))).toBeNull();
    });
});
