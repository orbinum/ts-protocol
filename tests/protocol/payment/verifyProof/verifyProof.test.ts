/** checkPaymentProof / verifyPaymentProof against real notes, with the public address only. */
import { describe, expect, it } from 'vitest';
import {
    checkPaymentProof,
    verifyPaymentProof,
    type NoteTreeLookup,
} from '../../../../src/protocol/payment';
import { ADDRESS, PROOF_VECTORS, proofVector } from '../vectors';

const tree: NoteTreeLookup = {
    getFinalizedLeafIndex: async () => 9,
    getMerkleProofByCommitment: async () => ({ leafIndex: 9 }),
};
const expectedOf = (name: string) => {
    const e = proofVector(name).expected!;
    return { value: BigInt(e.value), assetId: BigInt(e.assetId) };
};

describe('checkPaymentProof (offline)', () => {
    for (const v of PROOF_VECTORS.filter((c) => c.expected)) {
        it(`${v.name}: proves amount, asset and sender`, () => {
            const result = checkPaymentProof(v.proof, {
                address: ADDRESS,
                expected: expectedOf(v.name),
            });
            expect(result).toMatchObject({
                ok: true,
                payment: {
                    value: BigInt(v.expected!.value),
                    assetId: BigInt(v.expected!.assetId),
                    sender: v.expected!.sender,
                },
            });
            // Only what was checked: nothing a payer could set freely to key an order on.
            expect(Object.keys((result as { payment: object }).payment).sort()).toEqual([
                'assetId',
                'commitmentHex',
                'sender',
                'value',
            ]);
        });
    }

    for (const v of PROOF_VECTORS.filter((c) => !c.expected)) {
        it(`${v.name}: refused`, () => {
            expect(
                checkPaymentProof(v.proof, {
                    address: ADDRESS,
                    expected: { value: 1n, assetId: 0n },
                })
            ).toEqual({ ok: false, reason: 'invalid-proof' });
        });
    }

    it('names the mismatch for a real payment of another amount or asset', () => {
        const v = proofVector('anonymous');
        expect(
            checkPaymentProof(v.proof, {
                address: ADDRESS,
                expected: { value: 1501n, assetId: 0n },
            })
        ).toMatchObject({ ok: false, reason: 'wrong-amount', payment: { value: 1500n } });
        expect(
            checkPaymentProof(v.proof, {
                address: ADDRESS,
                expected: { value: 1500n, assetId: 1n },
            })
        ).toMatchObject({ ok: false, reason: 'wrong-asset' });
    });
});

describe('verifyPaymentProof (chain)', () => {
    it('adds the leaf index of a landed note', async () => {
        const result = await verifyPaymentProof(proofVector('pseudonym').proof, {
            address: ADDRESS,
            tree,
            expected: expectedOf('pseudonym'),
        });
        expect(result).toMatchObject({ ok: true, payment: { leafIndex: 9, value: 2500n } });
    });

    it('reports a note the node does not have as not-on-chain', async () => {
        const missing: NoteTreeLookup = {
            getFinalizedLeafIndex: async () => null,
            getMerkleProofByCommitment: async () => {
                throw new Error('Commitment not found in tree');
            },
        };
        const result = await verifyPaymentProof(proofVector('anonymous').proof, {
            address: ADDRESS,
            tree: missing,
            expected: expectedOf('anonymous'),
        });
        expect(result).toMatchObject({
            ok: false,
            reason: 'not-on-chain',
            payment: { value: 1500n },
        });
    });
});
