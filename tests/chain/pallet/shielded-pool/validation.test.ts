import { describe, it, expect } from 'vitest';
import {
    assertClaimFeesParams,
    assertMerkleRoots,
    assertPrivateTransferParams,
    assertShieldParams,
    assertUnshieldParams,
} from '../../../../src/chain/pallet/shielded-pool/calls/index';
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

/** `claim_fees(asset_id: u32, amount: u128)`. */
describe('assertClaimFeesParams', () => {
    it('accepts the full valid range', () => {
        for (const params of [
            { assetId: 0, amount: 1n },
            { assetId: 0xffff_ffff, amount: (1n << 128n) - 1n },
        ]) {
            expect(() => assertClaimFeesParams(params, 'claim')).not.toThrow();
        }
    });

    it('refuses an amount that is not positive or does not fit u128', () => {
        for (const amount of [0n, -1n, 1n << 128n]) {
            expect(() => assertClaimFeesParams({ assetId: 0, amount }, 'claim')).toThrow(
                'claim.amount'
            );
        }
    });

    it('refuses an asset id that is not a u32', () => {
        for (const assetId of [-1, 2 ** 32, 1.5, Number.NaN]) {
            expect(() => assertClaimFeesParams({ assetId, amount: 1n }, 'claim')).toThrow(
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

describe('assertUnshieldParams', () => {
    const ok = {
        proof: new Uint8Array([1]),
        merkleRoot: commitmentHexOf(1n),
        nullifier: '0x' + 'ab'.repeat(32),
        assetId: 0,
        amount: 5n,
        recipientAddress: '0x' + '12'.repeat(32),
        fee: 1n,
        changeCommitment: '0x' + 'cd'.repeat(32),
        circuitVersion: 3,
    };

    it('accepts a well-formed unshield', () => {
        expect(() => assertUnshieldParams(ok, 'u')).not.toThrow();
    });

    it.each([
        ['proof', { proof: new Uint8Array(0) }, /proof/],
        ['root', { merkleRoot: '0x' + 'ff'.repeat(32) }, /canonical/],
        ['nullifier', { nullifier: '0x12' }, /nullifier.*32-byte/],
        ['amount', { amount: 0n }, /amount/],
        ['fee', { fee: -1n }, /fee/],
        ['fee width', { fee: 1n << 128n }, /fee/],
        ['change', { changeCommitment: 'zz' }, /changeCommitment/],
        ['asset', { assetId: -1 }, /assetId/],
    ])('refuses a bad %s', (_, over, err) => {
        expect(() => assertUnshieldParams({ ...ok, ...over }, 'u')).toThrow(err);
    });
});

describe('assertPrivateTransferParams', () => {
    const memo = new Uint8Array(180);
    const ok = {
        proof: new Uint8Array([1]),
        merkleRoots: [commitmentHexOf(1n), commitmentHexOf(2n)] as [string, string],
        inputs: [{ nullifier: '0x' + 'aa'.repeat(32) }, { nullifier: '0x' + 'bb'.repeat(32) }],
        outputs: [
            { commitment: '0x' + 'cc'.repeat(32), encryptedMemo: memo },
            { commitment: '0x' + 'dd'.repeat(32), encryptedMemo: memo },
        ],
        assetId: 0,
        fee: 0n,
        circuitVersion: 3,
    };

    it('accepts a well-formed transfer', () => {
        expect(() => assertPrivateTransferParams(ok, 't')).not.toThrow();
    });

    it('refuses any arity but two inputs and two outputs', () => {
        expect(() =>
            assertPrivateTransferParams({ ...ok, inputs: ok.inputs.slice(0, 1) }, 't')
        ).toThrow(/2 inputs/);
        expect(() =>
            assertPrivateTransferParams({ ...ok, outputs: [...ok.outputs, ok.outputs[0]!] }, 't')
        ).toThrow(/2 outputs/);
    });

    it('refuses a malformed nullifier or commitment', () => {
        const badIn = [{ nullifier: '0x' }, ok.inputs[1]!];
        expect(() => assertPrivateTransferParams({ ...ok, inputs: badIn }, 't')).toThrow(
            /inputs\[0\]\.nullifier/
        );
        const badOut = [ok.outputs[0]!, { commitment: '0x00', encryptedMemo: memo }];
        expect(() => assertPrivateTransferParams({ ...ok, outputs: badOut }, 't')).toThrow(
            /outputs\[1\]\.commitment/
        );
    });
});
