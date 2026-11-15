import { describe, it, expect } from 'vitest';
import {
    privateMemberAccountId,
    privateMemberAddress,
    privateMinFeeShares,
    privateShareValue,
    privateSharesFor,
    type PrivatePoolQuote,
} from '../../../../src/chain/pallet/private-staking/index';

const ORB = 10n ** 18n;
const quote = (over: Partial<PrivatePoolQuote> = {}): PrivatePoolQuote => ({
    poolId: 3,
    assetId: 3,
    supply: 100n * ORB,
    netValue: 110n * ORB,
    virtualOffset: ORB,
    windDown: null,
    ...over,
});

describe('privateMemberAccountId', () => {
    it('derives the runtime member account (live spec 22 Members storage)', () => {
        expect(privateMemberAccountId(3)).toBe(
            '0x6d6f646c6f72622f7073746b0300000000000000000000000000000000000000'
        );
        expect(privateMemberAddress(1)).toBe('5EYCAe5iXnakCRU2dL4Gwrz2xRaB1nD8V4i7XPapcd1EXvx1');
    });

    it('refuses a pool id that is not a u32', () => {
        expect(() => privateMemberAccountId(-1)).toThrow();
        expect(() => privateMemberAccountId(2 ** 32)).toThrow();
    });
});

describe('share pricing', () => {
    it('values shares with the virtual offset, rounding down', () => {
        // 10·(110+1)/(100+1) = 10.990099… ORB
        expect(privateShareValue(quote(), 10n * ORB)).toBe((10n * ORB * 111n) / 101n);
    });

    it('never values shares above pro rata, as after a slash', () => {
        // Price 0.5: the offset price 10·(50+1)/(100+1) would be 5.049… ORB.
        const slashed = quote({ netValue: 50n * ORB });
        expect(privateShareValue(slashed, 10n * ORB)).toBe(5n * ORB);
        const fee = privateMinFeeShares(slashed, ORB / 100n);
        expect(privateShareValue(slashed, fee)).toBeGreaterThanOrEqual(ORB / 100n);
        expect(privateShareValue(slashed, fee - 1n)).toBeLessThan(ORB / 100n);
    });

    it('gives the last shares everything left', () => {
        expect(privateShareValue(quote(), 100n * ORB)).toBe(110n * ORB);
        expect(privateShareValue(quote(), 0n)).toBe(0n);
    });

    it('prices a destroying pool pro rata of its fixed value', () => {
        const wind = { value: 50n * ORB, liquid: 0n, unlockEra: 9, withdrawn: false };
        expect(privateShareValue(quote({ windDown: wind }), 10n * ORB)).toBe(5n * ORB);
        expect(privateShareValue(quote({ windDown: wind }), 100n * ORB)).toBe(50n * ORB);
        expect(privateSharesFor(quote({ windDown: wind }), ORB)).toBe(0n);
    });

    it('estimates an entry at one share per ORB in an empty pool', () => {
        expect(privateSharesFor(quote({ supply: 0n, netValue: 0n }), 10n * ORB)).toBe(10n * ORB);
    });

    it('charges a fee floor rounded up and of at least one share', () => {
        const fee = privateMinFeeShares(quote(), ORB / 100n);
        expect(privateShareValue(quote(), fee)).toBeGreaterThanOrEqual(ORB / 100n - 1n);
        expect(privateShareValue(quote(), fee - 1n)).toBeLessThan(ORB / 100n);
        expect(privateMinFeeShares(quote({ supply: 0n, netValue: 10n ** 30n }), 1n)).toBe(1n);
    });
});
