import { describe, it, expect } from 'vitest';
import {
    assertNotSignedSpend,
    isOrWrapsUnsignedOnlyCall,
} from '../../../../src/chain/pallet/shielded-pool/calls/index';

const call = (pallet: string, name: string, value: unknown = {}) => ({
    type: pallet,
    value: { type: name, value },
});

describe('isOrWrapsUnsignedOnlyCall', () => {
    it('matches private_transfer and unshield', () => {
        expect(isOrWrapsUnsignedOnlyCall(call('ShieldedPool', 'private_transfer'))).toBe(true);
        expect(isOrWrapsUnsignedOnlyCall(call('ShieldedPool', 'unshield'))).toBe(true);
    });

    it('matches a spend nested in a batch or a proxy', () => {
        const batch = call('Utility', 'batch_all', {
            calls: [call('Balances', 'transfer'), call('ShieldedPool', 'unshield')],
        });
        expect(isOrWrapsUnsignedOnlyCall(batch)).toBe(true);
        expect(isOrWrapsUnsignedOnlyCall(call('Proxy', 'proxy', { call: batch }))).toBe(true);
    });

    it('leaves signed shielded-pool calls and other pallets alone', () => {
        for (const name of ['shield', 'shield_batch', 'claim_fees']) {
            expect(isOrWrapsUnsignedOnlyCall(call('ShieldedPool', name))).toBe(false);
        }
        expect(isOrWrapsUnsignedOnlyCall(call('Other', 'unshield'))).toBe(false);
        expect(isOrWrapsUnsignedOnlyCall(undefined)).toBe(false);
    });

    it('does not walk into byte arrays', () => {
        const proof = new Uint8Array(4096);
        expect(isOrWrapsUnsignedOnlyCall(call('ShieldedPool', 'shield', { proof }))).toBe(false);
    });
});

describe('assertNotSignedSpend', () => {
    it('throws for a spend and passes anything else', () => {
        expect(() =>
            assertNotSignedSpend({ decodedCall: call('ShieldedPool', 'unshield') })
        ).toThrow(/submitted unsigned/);
        expect(() =>
            assertNotSignedSpend({ decodedCall: call('ShieldedPool', 'claim_fees') })
        ).not.toThrow();
    });
});
