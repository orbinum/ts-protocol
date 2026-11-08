/** Reading the declared sender strictly: anything not canonical is anonymous. */
import { describe, expect, it } from 'vitest';
import { BN254_R, bigintTo32Le, bytesToBigintLE } from '../../../../src';
import { decodeSenderClaim } from '../../../../src/protocol/payment/sender';

const pseudonym = (name: string, extra?: (bytes: Uint8Array) => void) => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < name.length; i++) bytes[i] = name.charCodeAt(i);
    extra?.(bytes);
    return (1n << 254n) | bytesToBigintLE(bytes);
};

describe('decodeSenderClaim', () => {
    it('anonymous: zero, out of range, not a bigint', () => {
        for (const v of [0n, -1n, 1n << 256n])
            expect(decodeSenderClaim(v)).toEqual({ kind: 'anonymous' });
        expect(decodeSenderClaim(5 as never)).toEqual({ kind: 'anonymous' });
    });

    it('pseudonym: canonical names only', () => {
        expect(decodeSenderClaim(pseudonym('CoffeeShop'))).toEqual({
            kind: 'pseudonym',
            name: 'CoffeeShop',
        });
        expect(decodeSenderClaim(pseudonym('Coffee Shop'))).toEqual({ kind: 'anonymous' });
        expect(decodeSenderClaim(pseudonym('Shop', (b) => (b[10] = 65)))).toEqual({
            kind: 'anonymous',
        });
        expect(decodeSenderClaim(pseudonym('A'.repeat(25)))).toEqual({ kind: 'anonymous' });
        expect(decodeSenderClaim(pseudonym('‮evil'))).toEqual({ kind: 'anonymous' });
    });

    it('address: an owner key in range, both sign bits', () => {
        expect(decodeSenderClaim((2n << 254n) | 7n)).toEqual({
            kind: 'address',
            ownerPk: 7n,
            viewingKeySign: 0n,
        });
        expect(decodeSenderClaim((3n << 254n) | 7n)).toEqual({
            kind: 'address',
            ownerPk: 7n,
            viewingKeySign: 1n,
        });
        expect(decodeSenderClaim(2n << 254n)).toEqual({ kind: 'anonymous' });
        expect(decodeSenderClaim((2n << 254n) | BN254_R)).toEqual({ kind: 'anonymous' });
        void bigintTo32Le;
    });
});
