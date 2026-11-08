/**
 * Security guarantees of payment verification, one test per property, grouped
 * by the threat each answers. A change that weakens a defence fails the test
 * named after it.
 */
import { describe, expect, it, vi } from 'vitest';
import {
    decodePaymentSlip,
    encodePaymentSlip,
    openPaymentSlip,
    sealPaymentSlip,
    toHex,
    fromHex,
} from '../../../../src';
import {
    readPaymentSlip,
    verifyPayment,
    type NoteTreeLookup,
} from '../../../../src/protocol/payment';
import { ownerPkPoint } from '../../../../src/protocol/payment/owner';
import { KEY, RECIPIENT_IVK, vector } from '../vectors';

const fieldsOf = (name: string) =>
    openPaymentSlip(KEY.viewingSecretKey, decodePaymentSlip(vector(name).slip)!)!;
const reseal = (fields: Parameters<typeof sealPaymentSlip>[1]) =>
    encodePaymentSlip(sealPaymentSlip(RECIPIENT_IVK, fields));
const landed = (): NoteTreeLookup & { calls: string[] } => {
    const calls: string[] = [];
    return {
        calls,
        getMerkleProofByCommitment: async (hex) => (calls.push(hex), { leafIndex: 1 }),
    };
};
const expected = { value: 4200n, assetId: 0n };

describe('Threat: anyone with the address seals a slip for a payment never made', () => {
    it('another note’s commitment around this memo is refused', () => {
        const forged = reseal({
            ...fieldsOf('anonymous'),
            commitmentHex: fieldsOf('pseudonym').commitmentHex,
        });
        expect(openPaymentSlip(KEY.viewingSecretKey, decodePaymentSlip(forged)!)).not.toBeNull(); // the envelope is valid
        expect(readPaymentSlip(forged, KEY)).toBeNull();
    });

    it('a tampered memo is refused', () => {
        const fields = fieldsOf('anonymous');
        const memo = fromHex(fields.encryptedMemo);
        memo[40]! ^= 1;
        expect(readPaymentSlip(reseal({ ...fields, encryptedMemo: toHex(memo) }), KEY)).toBeNull();
    });

    it('a note addressed to someone else is refused', () => {
        expect(readPaymentSlip(vector('not-ours').slip, KEY)).toBeNull();
    });

    it('the right slip under another (valid) owner key is refused', () => {
        const otherOwner = Array.from({ length: 64 }, (_, i) => BigInt(i + 2)).find(
            (ax) => ax !== KEY.ownerPk && ownerPkPoint(ax) !== null
        )!;
        expect(
            readPaymentSlip(vector('anonymous').slip, { ...KEY, ownerPk: otherOwner })
        ).toBeNull();
    });

    it('a slip the chain does not hold is not a payment', async () => {
        const tree: NoteTreeLookup = {
            getMerkleProofByCommitment: async () => {
                throw new Error('RPC error: commitment not found');
            },
        };
        expect(
            await verifyPayment(vector('anonymous').slip, { key: KEY, tree, expected })
        ).toMatchObject({
            ok: false,
            reason: 'not-on-chain',
        });
    });
});

describe('Threat: a claimed sender that is not proven', () => {
    it('an address claim the commitment does not back is reported as anonymous, never as that address', () => {
        expect(readPaymentSlip(vector('unverified-address-claim').slip, KEY)?.sender).toEqual({
            kind: 'anonymous',
        });
    });

    it('a proven address claim names the sender’s orbpriv3 address', () => {
        expect(readPaymentSlip(vector('address').slip, KEY)?.sender).toMatchObject({
            kind: 'address',
            address: expect.stringMatching(/^orbpriv3:0x[0-9a-f]{64}:0x[0-9a-f]{64}:[0-9a-f]{8}$/),
        });
    });
});

describe('Threat: hostile input that crashes or stalls the verifier', () => {
    it('never throws on a bad slip, whatever its shape', () => {
        for (const bad of [
            '',
            'orbslip1:',
            'orbslip1:!!!!:00000000',
            'orbslip2:AAAA:00000000',
            '\u0000'.repeat(64),
        ]) {
            expect(readPaymentSlip(bad, KEY), JSON.stringify(bad).slice(0, 20)).toBeNull();
        }
        for (const notString of [undefined, null, 42, {}, new Uint8Array(10)]) {
            expect(readPaymentSlip(notString as never, KEY)).toBeNull();
        }
    });

    it('an oversized slip is refused', () => {
        expect(readPaymentSlip(`orbslip1:${'A'.repeat(5_000_000)}:00000000`, KEY)).toBeNull();
    });
});

describe('Threat: a key or an expectation wired wrong', () => {
    it('an unusable key throws instead of answering “not yours” to every slip', () => {
        expect(() =>
            readPaymentSlip(vector('anonymous').slip, {
                ...KEY,
                viewingSecretKey: new Uint8Array(32),
            })
        ).toThrow(TypeError);
        expect(() =>
            readPaymentSlip(vector('anonymous').slip, {
                ...KEY,
                viewingSecretKey: new Uint8Array(31).fill(1),
            })
        ).toThrow(TypeError);
        expect(() => readPaymentSlip(vector('anonymous').slip, { ...KEY, ownerPk: 0n })).toThrow(
            TypeError
        );
    });

    it('an expectation that cannot describe a payment throws', async () => {
        const tree = landed();
        for (const bad of [
            { value: 4200 as never, assetId: 0n },
            { value: 0n, assetId: 0n },
            { value: -1n, assetId: 0n },
            { value: 4200n, assetId: 0 as never },
            { value: 4200n, assetId: 1n << 32n },
            undefined as never,
        ]) {
            await expect(
                verifyPayment(vector('anonymous').slip, { key: KEY, tree, expected: bad })
            ).rejects.toThrow(TypeError);
        }
        expect(tree.calls).toEqual([]);
    });
});

describe('Threat: something that looks paid but is not the payment', () => {
    it('a zero-value note reads, but can never verify as a payment', async () => {
        expect(readPaymentSlip(vector('zero-value').slip, KEY)?.value).toBe(0n);
        const result = await verifyPayment(vector('zero-value').slip, {
            key: KEY,
            tree: landed(),
            expected: { value: 1n, assetId: 0n },
        });
        expect(result).toMatchObject({ ok: false, reason: 'wrong-amount' });
    });

    it('a payment of another amount or asset does not pay the order', async () => {
        const tree = landed();
        expect(
            await verifyPayment(vector('anonymous').slip, {
                key: KEY,
                tree,
                expected: { value: 4199n, assetId: 0n },
            })
        ).toMatchObject({
            reason: 'wrong-amount',
        });
        expect(
            await verifyPayment(vector('anonymous').slip, {
                key: KEY,
                tree,
                expected: { value: 4200n, assetId: 7n },
            })
        ).toMatchObject({
            reason: 'wrong-asset',
        });
    });

    it('a public-memo payment is still a payment (anyone could read its memo)', () => {
        expect(readPaymentSlip(vector('public-memo').slip, KEY)?.value).toBe(88n);
    });
});

describe('Threat: a submitted slip makes the backend query the node about arbitrary notes', () => {
    it('the chain is asked only about a consistent slip for this key and the expected amount', async () => {
        const tree = landed();
        await verifyPayment(vector('not-ours').slip, { key: KEY, tree, expected });
        await verifyPayment('orbslip1:junk:00000000', { key: KEY, tree, expected });
        await verifyPayment(vector('anonymous').slip, {
            key: KEY,
            tree,
            expected: { value: 1n, assetId: 0n },
        });
        expect(tree.calls).toEqual([]);
        await verifyPayment(vector('anonymous').slip, { key: KEY, tree, expected });
        expect(tree.calls).toEqual([fieldsOf('anonymous').commitmentHex]);
    });
});

describe('Threat: an unreliable node decides an order', () => {
    it('a node that cannot answer throws (retry), never “not paid”', async () => {
        for (const message of [
            'merkle proof queue is full',
            'Method not found: privacy_getMerkleProofByCommitment',
            'WebSocket is not connected',
            'Request timeout',
            'Internal error: block not found (state pruned)',
            'Internal error',
        ]) {
            const tree: NoteTreeLookup = {
                getMerkleProofByCommitment: async () => {
                    throw new Error(message);
                },
            };
            await expect(
                verifyPayment(vector('anonymous').slip, { key: KEY, tree, expected }),
                message
            ).rejects.toThrow();
        }
    });

    it('a nonsense answer throws instead of confirming', async () => {
        for (const answer of [
            {},
            { leafIndex: -1 },
            { leafIndex: 1.5 },
            { leafIndex: Number.NaN },
            null,
        ]) {
            const tree = { getMerkleProofByCommitment: vi.fn(async () => answer as never) };
            await expect(
                verifyPayment(vector('anonymous').slip, { key: KEY, tree, expected }),
                JSON.stringify(answer)
            ).rejects.toThrow();
        }
    });
});

describe('Threat: one slip paying two orders (caller duty, made possible here)', () => {
    it('the same slip always yields the same commitment to deduplicate on', async () => {
        const a = await verifyPayment(vector('anonymous').slip, {
            key: KEY,
            tree: landed(),
            expected,
        });
        const b = await verifyPayment(` ${vector('anonymous').slip} `, {
            key: KEY,
            tree: landed(),
            expected,
        });
        expect(a.ok && b.ok && a.payment.commitmentHex === b.payment.commitmentHex).toBe(true);
    });
});
