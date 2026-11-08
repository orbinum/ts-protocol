/** verifyPayment: amount, asset and the chain, after a successful read. */
import { describe, expect, it } from 'vitest';
import { verifyPayment, type NoteTreeLookup } from '../../../../src/protocol/payment';
import { isMissingCommitment } from '../../../../src/protocol/payment/verify';
import { KEY, vector } from '../vectors';

const landed: NoteTreeLookup = { getMerkleProofByCommitment: async () => ({ leafIndex: 41 }) };
const expected = { value: 4200n, assetId: 0n };
const slip = vector('anonymous').slip;

describe('verifyPayment', () => {
    it('a landed payment of exactly the expected amount and asset', async () => {
        expect(await verifyPayment(slip, { key: KEY, tree: landed, expected })).toMatchObject({
            ok: true,
            payment: {
                value: 4200n,
                assetId: 0n,
                leafIndex: 41,
                commitmentHex: expect.any(String),
            },
        });
    });

    it('reports wrong asset, wrong amount and not-for-you with the read payment', async () => {
        expect(
            await verifyPayment(slip, {
                key: KEY,
                tree: landed,
                expected: { ...expected, assetId: 7n },
            })
        ).toMatchObject({
            ok: false,
            reason: 'wrong-asset',
            payment: { value: 4200n },
        });
        expect(
            await verifyPayment(slip, {
                key: KEY,
                tree: landed,
                expected: { ...expected, value: 4201n },
            })
        ).toMatchObject({
            ok: false,
            reason: 'wrong-amount',
        });
        expect(
            await verifyPayment(vector('not-ours').slip, { key: KEY, tree: landed, expected })
        ).toEqual({
            ok: false,
            reason: 'not-for-you',
        });
    });

    it('a big value in another asset verifies exactly', async () => {
        const big = { value: (1n << 100n) + 5n, assetId: 7n };
        expect(
            await verifyPayment(vector('other-asset-big-value').slip, {
                key: KEY,
                tree: landed,
                expected: big,
            })
        ).toMatchObject({
            ok: true,
        });
    });
});

describe('isMissingCommitment', () => {
    it('only the node saying the commitment is not there counts', () => {
        expect(isMissingCommitment(new Error('RPC error: commitment not found'))).toBe(true);
        expect(isMissingCommitment(new Error('no merkle proof for commitment'))).toBe(true);
        for (const message of [
            'Method not found: privacy_getMerkleProofByCommitment',
            'WebSocket is not connected',
            'merkle proof queue is full',
            'Request timeout',
            'Internal error',
        ]) {
            expect(isMissingCommitment(new Error(message)), message).toBe(false);
        }
    });
});
