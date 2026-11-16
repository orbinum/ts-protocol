/** A `shield_batch` operation read back, in the runtime's tuple order. */
import { describe, expect, it } from 'vitest';
import { decodeShieldBatchOperation } from '../../../../src/chain/pallet/shielded-pool/calls/callArgs';

const COMMITMENT = '0x' + 'AB'.repeat(32);

describe('decodeShieldBatchOperation', () => {
    it('reads (asset_id, amount, commitment, memo, proof, circuit_version)', () => {
        const op = [0, '1000', COMMITMENT, '0x00', '0x01', 3];
        expect(decodeShieldBatchOperation(op)).toEqual({
            assetId: 0,
            amount: 1000n,
            commitment: COMMITMENT.toLowerCase(),
            circuitVersion: 3,
        });
        const papi = [2, 5n, { asHex: () => COMMITMENT }, {}, {}, 4];
        expect(decodeShieldBatchOperation(papi)?.commitment).toBe(COMMITMENT.toLowerCase());
    });

    it('is null for any other shape', () => {
        expect(decodeShieldBatchOperation([0, 1n, COMMITMENT])).toBeNull();
        expect(decodeShieldBatchOperation([0, 'x', COMMITMENT, 0, 0, 3])).toBeNull();
        expect(decodeShieldBatchOperation([0, 1n, 'nothex', 0, 0, 3])).toBeNull();
        expect(decodeShieldBatchOperation(null)).toBeNull();
    });
});
