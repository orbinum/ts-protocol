import { describe, it, expect } from 'vitest';
import { assertClaimRelayFeesParams } from '../../../../src/chain/pallet/shielded-pool/validation';

/** `claim_relay_fees(asset_id: u32, amount: u128)`; both call paths use this check. */
describe('assertClaimRelayFeesParams', () => {
    it('accepts the full valid range', () => {
        for (const params of [
            { assetId: 0, amount: 1n },
            { assetId: 0xffff_ffff, amount: (1n << 128n) - 1n },
        ]) {
            expect(() => assertClaimRelayFeesParams(params, 'claim')).not.toThrow();
        }
    });

    it('refuses an amount that is not positive or does not fit u128', () => {
        for (const amount of [0n, -1n, 1n << 128n]) {
            expect(() => assertClaimRelayFeesParams({ assetId: 0, amount }, 'claim')).toThrow(
                'claim.amount'
            );
        }
    });

    it('refuses an asset id that is not a u32', () => {
        for (const assetId of [-1, 2 ** 32, 1.5, Number.NaN]) {
            expect(() => assertClaimRelayFeesParams({ assetId, amount: 1n }, 'claim')).toThrow(
                'claim.assetId'
            );
        }
    });
});
