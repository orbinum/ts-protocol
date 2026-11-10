/**
 * The pool commission rules as `pallet-nomination-pools` checks them: each refusal the
 * chain would return, and the calls it would accept.
 */
import { describe, it, expect } from 'vitest';
import {
    canClaimCommission,
    claimableCommission,
    claimCommissionRefusal,
    effectiveCommission,
    isThrottled,
    setCommissionChangeRateRefusal,
    setCommissionClaimPermissionRefusal,
    setCommissionMaxRefusal,
    setCommissionRefusal,
    unthrottledFrom,
    type CommissionContext,
} from '../../../../src/chain/pallet/nomination-pools/commission';
import type { PoolCommission } from '../../../../src/chain/pallet/nomination-pools/types/index';

const ROOT = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const BOB = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const CHARLIE = '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y';
const PCT = 10_000_000;

const NONE: PoolCommission = {
    current: null,
    max: null,
    changeRate: null,
    throttleFrom: null,
    claimPermission: null,
};

function ctx(
    commission: Partial<PoolCommission> = {},
    globalMax: number | null = null,
    block = 100
) {
    return {
        roles: { depositor: ROOT, root: ROOT, nominator: ROOT, bouncer: ROOT },
        commission: { ...NONE, ...commission },
        globalMax,
        block,
    } satisfies CommissionContext;
}

const to = (percent: number, payee = BOB) => ({ commission: percent * PCT, payee });

describe('setCommission', () => {
    it('is the root’s, with or without a rate', () => {
        expect(setCommissionRefusal(ctx(), BOB, to(5))).toBe('DoesNotHavePermission');
        expect(setCommissionRefusal(ctx(), BOB, null)).toBe('DoesNotHavePermission');
        expect(setCommissionRefusal(ctx(), ROOT, to(5))).toBeNull();
        expect(setCommissionRefusal(ctx(), ROOT, null)).toBeNull();
        // An unknown signer leaves the role to the chain.
        expect(setCommissionRefusal(ctx(), null, to(5))).toBeNull();
    });

    it('stays under the pool’s max and the global max', () => {
        expect(setCommissionRefusal(ctx({ max: 20 * PCT }), ROOT, to(21))).toBe(
            'CommissionExceedsMaximum'
        );
        expect(setCommissionRefusal(ctx({ max: 20 * PCT }), ROOT, to(20))).toBeNull();
        expect(setCommissionRefusal(ctx({}, 10 * PCT), ROOT, to(11))).toBe(
            'CommissionExceedsGlobalMaximum'
        );
        // The chain checks the global max first.
        expect(setCommissionRefusal(ctx({ max: 5 * PCT }, 10 * PCT), ROOT, to(11))).toBe(
            'CommissionExceedsGlobalMaximum'
        );
        expect(setCommissionRefusal(ctx({}, 10 * PCT), ROOT, to(10))).toBeNull();
    });

    it('is throttled by the change rate: too large, or too soon', () => {
        const rated = (current: number, throttleFrom: number | null, block: number) =>
            ctx(
                {
                    current: { rate: current * PCT, payee: BOB },
                    changeRate: { maxIncrease: 2 * PCT, minDelay: 10 },
                    throttleFrom,
                },
                null,
                block
            );
        expect(setCommissionRefusal(rated(5, 90, 100), ROOT, to(8))).toBe(
            'CommissionChangeThrottled'
        );
        expect(setCommissionRefusal(rated(5, 91, 100), ROOT, to(7))).toBe(
            'CommissionChangeThrottled'
        );
        expect(setCommissionRefusal(rated(5, 90, 100), ROOT, to(7))).toBeNull();
        // Decreases and removal are never throttled.
        expect(setCommissionRefusal(rated(5, 99, 100), ROOT, to(1))).toBeNull();
        expect(setCommissionRefusal(rated(5, 99, 100), ROOT, null)).toBeNull();
        // No `throttle_from` with a change rate: the chain throttles any increase.
        expect(isThrottled(rated(5, null, 100).commission, 6 * PCT, 100)).toBe(true);
    });

    it('says when a throttled increase becomes possible', () => {
        const c = ctx({
            current: { rate: 5 * PCT, payee: BOB },
            changeRate: { maxIncrease: 2 * PCT, minDelay: 10 },
            throttleFrom: 95,
        }).commission;
        expect(unthrottledFrom(c, 7 * PCT, 100)).toBe(105);
        expect(unthrottledFrom(c, 8 * PCT, 100)).toBeNull();
        expect(unthrottledFrom(c, 7 * PCT, 106)).toBe(106);
        const noDelay = { ...c, changeRate: { maxIncrease: 2 * PCT, minDelay: 0 } };
        expect(isThrottled(noDelay, 7 * PCT, 95)).toBe(false);
    });
});

describe('setCommissionMax', () => {
    it('only goes down, and stays under the global max', () => {
        expect(setCommissionMaxRefusal(ctx(), BOB, 10 * PCT)).toBe('DoesNotHavePermission');
        expect(setCommissionMaxRefusal(ctx(), ROOT, 100 * PCT)).toBeNull();
        expect(setCommissionMaxRefusal(ctx({ max: 20 * PCT }), ROOT, 21 * PCT)).toBe(
            'MaxCommissionRestricted'
        );
        expect(setCommissionMaxRefusal(ctx({ max: 20 * PCT }), ROOT, 20 * PCT)).toBeNull();
        expect(setCommissionMaxRefusal(ctx({}, 10 * PCT), ROOT, 11 * PCT)).toBe(
            'CommissionExceedsGlobalMaximum'
        );
    });
});

describe('setCommissionChangeRate', () => {
    it('only gets stricter: a smaller increase, a longer delay', () => {
        const rate = (maxIncrease: number, minDelay: number) => ({
            maxIncrease: maxIncrease * PCT,
            minDelay,
        });
        const set = ctx({ changeRate: rate(5, 10) });
        expect(setCommissionChangeRateRefusal(ctx(), BOB, rate(5, 10))).toBe(
            'DoesNotHavePermission'
        );
        expect(setCommissionChangeRateRefusal(ctx(), ROOT, rate(100, 0))).toBeNull();
        expect(setCommissionChangeRateRefusal(set, ROOT, rate(6, 10))).toBe(
            'CommissionChangeRateNotAllowed'
        );
        expect(setCommissionChangeRateRefusal(set, ROOT, rate(5, 9))).toBe(
            'CommissionChangeRateNotAllowed'
        );
        expect(setCommissionChangeRateRefusal(set, ROOT, rate(5, 10))).toBeNull();
        expect(setCommissionChangeRateRefusal(set, ROOT, rate(1, 20))).toBeNull();
    });
});

describe('claim permission', () => {
    it('is set by the root only', () => {
        expect(setCommissionClaimPermissionRefusal(ctx(), BOB)).toBe('DoesNotHavePermission');
        expect(setCommissionClaimPermissionRefusal(ctx(), ROOT)).toBeNull();
    });

    it('lets the root claim always, one account besides it, or anyone', () => {
        expect(canClaimCommission(ctx(), ROOT)).toBe(true);
        expect(canClaimCommission(ctx(), BOB)).toBe(false);
        const named = ctx({ claimPermission: { type: 'Account', account: BOB } });
        expect(canClaimCommission(named, BOB)).toBe(true);
        expect(canClaimCommission(named, ROOT)).toBe(true);
        expect(canClaimCommission(named, CHARLIE)).toBe(false);
        const anyone = ctx({ claimPermission: { type: 'Permissionless' } });
        expect(canClaimCommission(anyone, CHARLIE)).toBe(true);
    });
});

describe('claimCommission', () => {
    const current = { rate: 5 * PCT, payee: BOB };

    it('needs the permission, something to claim and a payee', () => {
        expect(claimCommissionRefusal(ctx({ current }), CHARLIE, 10n)).toBe(
            'DoesNotHavePermission'
        );
        expect(claimCommissionRefusal(ctx({ current }), ROOT, 0n)).toBe('NoPendingCommission');
        expect(claimCommissionRefusal(ctx(), ROOT, 10n)).toBe('NoCommissionCurrentSet');
        expect(claimCommissionRefusal(ctx({ current }), ROOT, 10n)).toBeNull();
    });

    it('adds the commission’s share of unrecorded rewards to what is pending', () => {
        const totals = {
            rewardBalance: 1_000n,
            totalRewardsClaimed: 300n,
            totalCommissionClaimed: 100n,
            totalCommissionPending: 7n,
            lastRecordedTotalPayouts: 400n,
        };
        // 10% of 1 000 + 300 + 100 - 400, rounded down.
        expect(claimableCommission(totals, 10 * PCT)).toBe(107n);
        expect(claimableCommission({ ...totals, rewardBalance: 9n }, 10 * PCT)).toBe(7n);
        expect(claimableCommission({ ...totals, lastRecordedTotalPayouts: 5_000n }, 10 * PCT)).toBe(
            7n
        );
    });

    it('takes no more than the global max from rewards', () => {
        expect(effectiveCommission({ ...NONE, current }, null)).toBe(5 * PCT);
        expect(effectiveCommission({ ...NONE, current }, 2 * PCT)).toBe(2 * PCT);
        expect(effectiveCommission(NONE, 2 * PCT)).toBe(0);
    });
});
