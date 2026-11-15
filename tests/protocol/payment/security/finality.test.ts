/**
 * Threat: a payment confirmed in a block that a reorganisation then reverts.
 *
 * The node's best block can still be replaced; a payment seen only there may
 * vanish, and the payer spend the same notes again. Verification requires a
 * FINALIZED block unless the caller opts out (`finality: 'best'`), and reports
 * a payment that has landed but is not final as `not-final` — never `ok`.
 */
import { describe, expect, it, vi } from 'vitest';
import {
    verifyPayment,
    verifyPaymentProof,
    type NoteTreeLookup,
} from '../../../../src/protocol/payment';
import { ADDRESS, KEY, proofVector, vector } from '../vectors';

const slip = vector('anonymous').slip;
const slipExpected = { value: BigInt(vector('anonymous').expected!.value), assetId: 0n };
const proof = proofVector('anonymous').proof;
const proofExpected = { value: 1500n, assetId: 0n };

/** Both verifiers, same tree and options: every property holds for each. */
const both = (tree: NoteTreeLookup, extra: object = {}) => [
    verifyPayment(slip, { key: KEY, tree, expected: slipExpected, ...extra }),
    verifyPaymentProof(proof, { address: ADDRESS, tree, expected: proofExpected, ...extra }),
];
const tree = (
    finalized: () => Promise<number | null>,
    best: () => Promise<{ leafIndex: number }>
) => ({
    getFinalizedLeafIndex: vi.fn(finalized),
    getMerkleProofByCommitment: vi.fn(best),
});

describe('Threat: a payment confirmed in a block that is then reverted', () => {
    it('in the best block but not finalized: not-final, never ok', async () => {
        const t = tree(
            async () => null,
            async () => ({ leafIndex: 7 })
        );
        for (const result of await Promise.all(both(t))) {
            expect(result).toMatchObject({ ok: false, reason: 'not-final' });
        }
    });

    it('finalized: ok, with the finalized chain’s leaf index', async () => {
        const t = tree(
            async () => 5,
            async () => ({ leafIndex: 999 })
        );
        for (const result of await Promise.all(both(t))) {
            expect(result).toMatchObject({ ok: true, payment: { leafIndex: 5 } });
        }
        expect(t.getMerkleProofByCommitment).not.toHaveBeenCalled();
    });

    it('in neither: not-on-chain', async () => {
        const t = tree(
            async () => null,
            async () => {
                throw new Error('commitment not found');
            }
        );
        for (const result of await Promise.all(both(t))) {
            expect(result).toMatchObject({ ok: false, reason: 'not-on-chain' });
        }
    });

    it("finality: 'best' accepts the best block and never reads the finalized state", async () => {
        const t = tree(
            async () => null,
            async () => ({ leafIndex: 7 })
        );
        for (const result of await Promise.all(both(t, { finality: 'best' }))) {
            expect(result).toMatchObject({ ok: true, payment: { leafIndex: 7 } });
        }
        expect(t.getFinalizedLeafIndex).not.toHaveBeenCalled();
    });
});

describe('Threat: a miswired tree silently drops the finality requirement', () => {
    it('a tree that cannot read the finalized chain throws TypeError before any query', async () => {
        const best = vi.fn(async () => ({ leafIndex: 1 }));
        for (const run of both({ getMerkleProofByCommitment: best })) {
            // A message that says what to do, not "is not a function".
            await expect(run).rejects.toThrow(/cannot read the finalized chain/);
        }
        expect(best).not.toHaveBeenCalled();
    });

    it('an unknown finality throws TypeError', async () => {
        const t = tree(
            async () => 1,
            async () => ({ leafIndex: 1 })
        );
        for (const run of both(t, { finality: 'safe' }))
            await expect(run).rejects.toThrow(TypeError);
    });
});

describe('Threat: the finalized lookup fails or lies', () => {
    it('a lookup that cannot answer throws (retry), never “not paid”', async () => {
        const t = tree(
            async () => {
                throw new Error('Request timeout');
            },
            async () => ({ leafIndex: 1 })
        );
        for (const run of both(t)) await expect(run).rejects.toThrow('Request timeout');
    });

    it('a nonsense finalized index throws instead of confirming', async () => {
        for (const answer of [-1, 1.5, Number.NaN, '3', 2 ** 53]) {
            const t = tree(
                async () => answer as never,
                async () => ({ leafIndex: 1 })
            );
            for (const run of both(t))
                await expect(run, String(answer)).rejects.toThrow(/invalid leaf index/);
        }
    });
});
