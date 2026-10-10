import { describe, it, expect } from 'vitest';
import {
    assertClaimRelayFeesParams,
    assertMerkleRoots,
    assertShieldParams,
} from '../../../../src/chain/pallet/shielded-pool/validation';
import { BN254_R } from '../../../../src/foundation/crypto/constants';
import { commitmentHexOf } from '../../../../src/foundation/encoding/bytes';

/** `private_transfer`'s two roots; both call paths use this check. */
describe('assertMerkleRoots', () => {
    const root = commitmentHexOf(12345n);

    it('accepts two canonical roots, equal or not', () => {
        expect(() => assertMerkleRoots([root, root], 'w')).not.toThrow();
        expect(() => assertMerkleRoots([root, commitmentHexOf(BN254_R - 1n)], 'w')).not.toThrow();
    });

    it('refuses any count but two', () => {
        for (const roots of [[], [root], [root, root, root]]) {
            expect(() => assertMerkleRoots(roots, 'w')).toThrow(/exactly two/);
        }
        expect(() => assertMerkleRoots('not-an-array' as never, 'w')).toThrow(/exactly two/);
    });

    it('refuses malformed hex', () => {
        for (const bad of ['0x12', root.slice(2), root + '00', '0x' + 'zz'.repeat(32)]) {
            expect(() => assertMerkleRoots([root, bad], 'w')).toThrow(/32-byte hex/);
        }
    });

    // The pallet matches roots byte for byte: `r + x` is the same field element
    // as `x` but a root no tree ever had.
    it('refuses a non-canonical field element', () => {
        for (const bad of [commitmentHexOf(BN254_R), '0x' + 'ff'.repeat(32)]) {
            expect(() => assertMerkleRoots([bad, root], 'w')).toThrow(/canonical/);
        }
    });
});

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

/** `shield`; the pallet call, the batch and the precompile calldata use this check. */
describe('assertShieldParams', () => {
    const valid = {
        assetId: 0,
        amount: 1n,
        commitment: '0x' + 'ab'.repeat(32),
        encryptedMemo: new Uint8Array(180),
        proof: new Uint8Array(128),
        circuitVersion: 1,
    };

    it('accepts a deposit with a memo and a proof', () => {
        expect(() => assertShieldParams(valid, 'shield')).not.toThrow();
    });

    it.each([
        ['amount', { amount: 0n }],
        ['amount', { amount: 1n << 128n }],
        ['assetId', { assetId: 2 ** 32 }],
        ['commitment', { commitment: '0x' + 'ab'.repeat(31) }],
        ['commitment', { commitment: 'ab'.repeat(32) }],
        ['encryptedMemo', { encryptedMemo: new Uint8Array(10) }],
        ['proof', { proof: new Uint8Array() }],
        ['circuitVersion', { circuitVersion: 2 ** 32 }],
        ['circuitVersion', { circuitVersion: 1.5 }],
    ])('refuses a bad %s', (field, over) => {
        expect(() => assertShieldParams({ ...valid, ...over }, 'shield')).toThrow(
            `shield.${field}`
        );
    });
});
