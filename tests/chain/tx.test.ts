import { describe, it, expect } from 'vitest';
import { signAndSubmitTx, toTxResult } from '../../src/chain/tx';
import type { UnsafeTx } from '../../src/chain/tx';
import type { SignerTxCreator as SubstrateSigner } from 'polkadot-api/tx-creator';

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

describe('signAndSubmitTx with a shielded-pool spend', () => {
    it('rejects before anything is signed', async () => {
        let signed = false;
        const tx = {
            decodedCall: { type: 'ShieldedPool', value: { type: 'private_transfer', value: {} } },
            createAndSubmit: () => {
                signed = true;
                return Promise.reject(new Error('unreachable'));
            },
        } as unknown as UnsafeTx;
        await expect(signAndSubmitTx(tx, {} as SubstrateSigner)).rejects.toThrow(/unsigned/);
        expect(signed).toBe(false);
    });
});

describe('fee and signed hash', () => {
    const feeEvent = {
        type: 'TransactionPayment',
        value: { type: 'TransactionFeePaid', value: { who: 'x', actual_fee: 1234n, tip: 0n } },
    };

    it('toTxResult carries the fee the inclusion charged, when there is one', () => {
        const paid = {
            txHash: '0x01',
            block: { hash: '0x02', number: 7 },
            ok: true,
            events: [feeEvent],
        };
        expect(toTxResult(paid as never).fee).toBe('1234');
        expect(toTxResult(finalized(true))).not.toHaveProperty('fee');
    });

    it('onSigned hears the hash before the tx is broadcast', async () => {
        const seen: string[] = [];
        const tx = {
            decodedCall: { type: 'Balances', value: { type: 'transfer_keep_alive', value: {} } },
            createSubmitAndWatch: () => ({
                subscribe(o: { next(e: unknown): void }) {
                    o.next({ type: 'signed', txHash: '0xaa' });
                    o.next({ type: 'broadcasted' });
                    o.next({
                        type: 'finalized',
                        txHash: '0xaa',
                        block: { hash: '0x02', number: 1 },
                        ok: true,
                        events: [feeEvent],
                    });
                },
            }),
        } as unknown as UnsafeTx;
        const result = await signAndSubmitTx(tx, {} as SubstrateSigner, {
            onSigned: (h) => seen.push(`signed ${h}`),
            onBroadcast: () => seen.push('broadcast'),
        });
        expect(seen).toEqual(['signed 0xaa', 'broadcast']);
        expect(result.fee).toBe('1234');
    });
});
