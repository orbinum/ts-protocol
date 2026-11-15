/**
 * Threat: a caller times the verifier to learn its viewing key.
 *
 * A backend opens slips that anyone can submit, multiplying its viewing secret
 * key by points the submitter chose. `fastMulPoint` takes scalar-dependent time,
 * so the key must only ever reach `secretMulPoint`. This watches every fast
 * multiplication during verification and fails if one sees the key.
 */
import { describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ fastScalars: [] as bigint[], secretScalars: [] as bigint[] }));
vi.mock('../../../../src/foundation/crypto/bjj-fast', async (importOriginal) => {
    const real =
        await importOriginal<typeof import('../../../../src/foundation/crypto/bjj-fast')>();
    return {
        ...real,
        fastMulPoint: (point: [bigint, bigint], scalar: bigint) => {
            seen.fastScalars.push(scalar);
            return real.fastMulPoint(point, scalar);
        },
        secretMulPoint: (point: [bigint, bigint], scalar: bigint) => {
            seen.secretScalars.push(scalar);
            return real.secretMulPoint(point, scalar);
        },
    };
});

import { readPaymentSlip, verifyPayment } from '../../../../src/protocol/payment';
import { bytesToBjjScalar } from '../../../../src/protocol/memo/memoFormat';
import { KEY, VECTORS } from '../vectors';

const IVSK_SCALAR = bytesToBjjScalar(KEY.viewingSecretKey);

describe('Threat: timing the verifier reveals its viewing key', () => {
    it('reading every kind of slip multiplies the key only on the constant-time path', async () => {
        seen.fastScalars.length = 0;
        seen.secretScalars.length = 0;
        for (const v of VECTORS) {
            readPaymentSlip(v.slip, KEY);
            await verifyPayment(v.slip, {
                key: KEY,
                expected: { value: 1n, assetId: 0n },
                tree: {
                    getFinalizedLeafIndex: async () => 1,
                    getMerkleProofByCommitment: async () => ({ leafIndex: 1 }),
                },
            });
        }
        // The key did go through multiplications (slip, memo, address claims)…
        expect(seen.secretScalars).toContain(IVSK_SCALAR);
        // …and never through the fast, scalar-dependent one.
        expect(seen.fastScalars).not.toContain(IVSK_SCALAR);
    });
});
