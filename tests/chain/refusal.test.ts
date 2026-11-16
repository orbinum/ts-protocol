import { describe, expect, it } from 'vitest';
import { ProtocolRefusal, protocolRefusal } from '../../src/chain/refusal';

describe('protocolRefusal', () => {
    it('reads a refusal, also one thrown by another copy of the package', () => {
        const own = new ProtocolRefusal('join', 'BelowMinimumJoin', 'join.amount: below', {
            minimum: 5n,
        });
        expect(protocolRefusal(own)).toBe(own);
        const foreign = Object.assign(new Error('x'), {
            name: 'ProtocolRefusal',
            call: 'join',
            reason: 'BelowMinimumJoin',
            detail: {},
        });
        expect(protocolRefusal(foreign)?.reason).toBe('BelowMinimumJoin');
    });

    it('is null for any other error', () => {
        expect(protocolRefusal(new Error('join.amount: below'))).toBeNull();
        expect(protocolRefusal('NotRoot')).toBeNull();
        expect(protocolRefusal(undefined)).toBeNull();
    });
});
