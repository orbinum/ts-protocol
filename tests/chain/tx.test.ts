import { describe, it, expect } from 'vitest';
import { toTxResult } from '../../src/chain/tx';

const finalized = (ok: boolean, dispatchError?: unknown) =>
    ({ txHash: '0x01', block: { hash: '0x02', number: 7 }, ok, dispatchError }) as never;

describe('toTxResult', () => {
    it('names both the pallet and the error of a failed call', () => {
        const r = toTxResult(
            finalized(false, {
                type: 'Module',
                value: { type: 'ShieldedPool', value: { type: 'ProofVerificationFailed' } },
            })
        );
        expect(r.ok).toBe(false);
        expect((r as { error?: string }).error).toBe(
            'Module(ShieldedPool.ProofVerificationFailed)'
        );
    });

    it('keeps the pallet alone when the error carries no name', () => {
        const r = toTxResult(finalized(false, { type: 'Module', value: { type: 'ShieldedPool' } }));
        expect((r as { error?: string }).error).toBe('Module(ShieldedPool)');
    });

    it('has no error on success', () => {
        expect(toTxResult(finalized(true))).not.toHaveProperty('error');
    });
});
