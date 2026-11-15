import { describe, it, expect } from 'vitest';
import {
    privateExitRefusal,
    privateExitValue,
    privateShareValue,
    type PrivateExitState,
    type PrivatePoolQuote,
} from '../../../../src/chain/pallet/private-staking/index';

const ORB = 10n ** 18n;
const quote = (over: Partial<PrivatePoolQuote> = {}): PrivatePoolQuote => ({
    poolId: 1,
    assetId: 7,
    supply: 100n * ORB,
    netValue: 110n * ORB,
    virtualOffset: ORB,
    windDown: null,
    ...over,
});
const state = (over: Partial<PrivateExitState> = {}): PrivateExitState => ({
    quote: quote(),
    memberValue: 110n * ORB,
    pendingEntryPoints: 0n,
    poolStake: 210n * ORB,
    nominating: true,
    minJoinBond: ORB,
    minNominatorBond: 100n * ORB,
    minSpendFee: ORB / 100n,
    unbondingEras: [],
    maxUnbonding: 8,
    unlockEra: 12,
    ...over,
});

describe('privateExitValue', () => {
    it('gives an exit leaving only its fee everything but what the fee is worth', () => {
        const q = quote();
        const fee = ORB;
        expect(privateExitValue(q, 99n * ORB, fee)).toBe(110n * ORB - privateShareValue(q, fee));
        expect(privateExitValue(q, 10n * ORB, fee)).toBe(privateShareValue(q, 10n * ORB));
    });
});

describe('privateExitRefusal', () => {
    it('admits a partial exit and checks its minimum against what it is paid', () => {
        const worth = privateShareValue(quote(), 50n * ORB);
        expect(privateExitRefusal(state(), 50n * ORB, ORB, worth)).toBeNull();
        expect(privateExitRefusal(state(), 50n * ORB, ORB, worth + 1n)).toBe('BelowMinimumOutput');
    });

    it('refuses shares it cannot redeem', () => {
        expect(privateExitRefusal(state(), 0n, 0n, 0n)).toBe('NothingToRedeem');
        expect(privateExitRefusal(state(), 100n * ORB, 1n, 0n)).toBe('SharesExceedSupply');
    });

    it('keeps the join minimum unless what else is left is dust', () => {
        // Worth 109.5 ORB of the member's 110: half an ORB would be left.
        const shares = (1095n * ORB * 101n) / (111n * 10n);
        expect(privateExitRefusal(state(), shares, 0n, 0n)).toBe('RemainderBelowMinimum');
        // The same remainder when the other shares are dust: the exit sweeps it.
        const dust = state({ minSpendFee: 10n * ORB });
        expect(privateExitRefusal(dust, shares, 0n, 0n)).toBeNull();
        // Not while entries are pending.
        expect(privateExitRefusal({ ...dust, pendingEntryPoints: 1n }, shares, 0n, 0n)).toBe(
            'RemainderBelowMinimum'
        );
    });

    it('keeps a nominating pool at the nominator minimum, a chilled one at none', () => {
        const slashed = state({ poolStake: 150n * ORB });
        expect(privateExitRefusal(slashed, 60n * ORB, 0n, 0n)).toBe('RemainderBelowMinimum');
        expect(privateExitRefusal({ ...slashed, nominating: false }, 60n * ORB, 0n, 0n)).toBeNull();
    });

    it('needs room for a new unbonding chunk', () => {
        const full = state({ unbondingEras: [5, 6, 7, 8, 9, 10, 11, 13] });
        expect(privateExitRefusal(full, 10n * ORB, 0n, 0n)).toBe('TooManyUnbonding');
        expect(privateExitRefusal({ ...full, unlockEra: 13 }, 10n * ORB, 0n, 0n)).toBeNull();
    });

    it('pays a winding-down pool pro rata of its fixed value', () => {
        const wind = { value: 50n * ORB, liquid: 0n, unlockEra: 9, withdrawn: false };
        const s = state({ quote: quote({ windDown: wind }) });
        expect(privateExitRefusal(s, 10n * ORB, 0n, 5n * ORB)).toBeNull();
        expect(privateExitRefusal(s, 10n * ORB, 0n, 5n * ORB + 1n)).toBe('BelowMinimumOutput');
    });
});
