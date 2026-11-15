/**
 * bjj-fast — the noble-backed BabyJubJub multiplication MUST be byte-identical
 * to @zk-kit/baby-jubjub's, on which every on-chain memo depends. A mismatch
 * here silently breaks memo decryption — this suite is the contract.
 *
 * Only the primitive equivalence lives here; the key-derivation half of the
 * contract (viewing keys, ownerPk) is custody and is pinned in the wallet SDK.
 */
import { describe, it, expect } from 'vitest';
import { mulPointEscalar, Base8 } from '@zk-kit/baby-jubjub';
import { fastMulBase, fastMulPoint } from '../../../src/foundation/crypto/bjj-fast';
import { BABYJUB_SUBORDER } from '../../../src/foundation/crypto/constants';

describe('bjj-fast ≡ zk-kit', () => {
    it('base multiplication matches over a scalar sweep', () => {
        for (let i = 1; i <= 40; i++) {
            const k = (1234567890123456789n * BigInt(i) * 987654321n) % BABYJUB_SUBORDER || 1n;
            expect(fastMulBase(k)).toEqual(mulPointEscalar(Base8, k));
        }
    });

    it('variable-point multiplication matches (the scan ECDH shape)', () => {
        const P = mulPointEscalar(Base8, 424242n);
        for (let i = 1; i <= 40; i++) {
            const k = (998877665544332211n * BigInt(i)) % BABYJUB_SUBORDER || 1n;
            expect(fastMulPoint(P, k)).toEqual(mulPointEscalar(P, k));
        }
    });

    it('edge scalars: 1, suborder-1, multiples of suborder', () => {
        expect(fastMulBase(1n)).toEqual(mulPointEscalar(Base8, 1n));
        expect(fastMulBase(BABYJUB_SUBORDER - 1n)).toEqual(
            mulPointEscalar(Base8, BABYJUB_SUBORDER - 1n)
        );
        // k ≡ 0 (mod n) → identity [0, 1] (zk-kit agrees on the reduced scalar).
        expect(fastMulBase(BABYJUB_SUBORDER)).toEqual([0n, 1n]);
    });

    it('over-suborder scalars reduce identically (Base8 has order n)', () => {
        const k = 2n * BABYJUB_SUBORDER + 12345n;
        expect(fastMulBase(k)).toEqual(mulPointEscalar(Base8, k));
        const P = mulPointEscalar(Base8, 777n);
        expect(fastMulPoint(P, k)).toEqual(mulPointEscalar(P, k));
    });

    it('identity point input: [0,1] × k = [0,1]', () => {
        expect(fastMulPoint([0n, 1n], 12345n)).toEqual([0n, 1n]);
    });
});

describe('secretMulPoint ≡ fastMulPoint (same point, constant-time path)', () => {
    it('agrees on random and edge scalars', async () => {
        const { secretMulPoint } = await import('../../../src/foundation/crypto/bjj-fast');
        const points = [fastMulBase(7n), fastMulBase(123456789n), Base8 as [bigint, bigint]];
        const scalars = [
            1n,
            2n,
            BABYJUB_SUBORDER - 1n,
            BABYJUB_SUBORDER,
            BABYJUB_SUBORDER + 5n,
            0n,
            0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdn,
        ];
        for (const p of points) {
            for (const s of scalars) {
                expect(secretMulPoint(p, s), `${s}`).toEqual(fastMulPoint(p, s));
            }
        }
    });
});
