import { describe, it, expect } from 'vitest';
import { privateCallOutcome } from '../../../../src/chain/pallet/private-call/index';

describe('privateCallOutcome', () => {
    const executed = (data: unknown) => ({
        phase: { applyExtrinsic: 1 },
        event: { section: 'privateCall', method: 'Executed', data },
    });
    const C = '0x' + 'AB'.repeat(32);

    it('reads the outcome by field name or by position', () => {
        expect(
            privateCallOutcome([
                executed({ success: true, gas_used: 21_000, value: '5', commitment: C }),
            ] as never)
        ).toEqual({ success: true, gasUsed: 21_000n, value: 5n, commitment: C.toLowerCase() });
        expect(privateCallOutcome([executed([false, 9n, 7n, null])] as never)).toEqual({
            success: false,
            gasUsed: 9n,
            value: 7n,
            commitment: null,
        });
    });

    it('is null without an Executed, or for a malformed one', () => {
        expect(privateCallOutcome([])).toBeNull();
        expect(
            privateCallOutcome([executed({ success: 'yes', gas_used: 1, value: 1 })] as never)
        ).toBeNull();
        expect(
            privateCallOutcome([
                executed({ success: true, gas_used: 1, value: 1, commitment: '0x12' }),
            ] as never)
        ).toBeNull();
    });
});
