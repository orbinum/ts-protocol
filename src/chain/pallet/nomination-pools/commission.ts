/**
 * A pool's commission rules, as `pallet-nomination-pools` checks them, so a client can say
 * why a commission call would fail before anyone signs it. The chain stays the authority;
 * these read only what it reads: the pool's roles and commission, `GlobalMaxCommission`
 * and the block the transaction lands in.
 */
import { PERBILL } from '../staking/constants';
import type {
    CommissionChangeRate,
    CommissionRefusal,
    NewPoolCommission,
    PoolCommission,
    PoolRoles,
} from './types/index';

/** What the rules read of the chain. */
export interface CommissionContext {
    roles: PoolRoles;
    commission: PoolCommission;
    /** `GlobalMaxCommission` in `Perbill` parts; null when governance set none. */
    globalMax: number | null;
    /** The earliest block the transaction can land in: the best block's successor. */
    block: number;
}

/** `rate` bounded by `globalMax`: what the pool takes from rewards now. */
export function effectiveCommission(commission: PoolCommission, globalMax: number | null): number {
    const rate = commission.current?.rate ?? 0;
    return globalMax === null ? rate : Math.min(rate, globalMax);
}

/**
 * Whether the change rate refuses moving the commission to `to` at `block`: an increase
 * larger than `maxIncrease`, or sooner than `minDelay` blocks after the last change.
 */
export function isThrottled(commission: PoolCommission, to: number, block: number): boolean {
    const rate = commission.changeRate;
    if (!rate) return false;
    const current = commission.current?.rate ?? 0;
    if (to <= current) return false;
    if (to - current > rate.maxIncrease) return true;
    if (commission.throttleFrom === null) return true;
    return rate.minDelay !== 0 && block - commission.throttleFrom < rate.minDelay;
}

/**
 * The first block from which `to` is not throttled, or null when no wait helps (the
 * increase is larger than `maxIncrease`).
 */
export function unthrottledFrom(
    commission: PoolCommission,
    to: number,
    block: number
): number | null {
    if (!isThrottled(commission, to, block)) return block;
    const rate = commission.changeRate;
    const current = commission.current?.rate ?? 0;
    if (!rate || to - current > rate.maxIncrease || commission.throttleFrom === null) return null;
    return commission.throttleFrom + rate.minDelay;
}

const isRoot = (ctx: CommissionContext, who: string | null) =>
    who === null || ctx.roles.root === who;

const aboveGlobal = (ctx: CommissionContext, parts: number) => parts > (ctx.globalMax ?? PERBILL);

/** Why `setCommission(next)` by `who` would fail, or null. `who` null skips the role check. */
export function setCommissionRefusal(
    ctx: CommissionContext,
    who: string | null,
    next: NewPoolCommission | null
): CommissionRefusal | null {
    if (!isRoot(ctx, who)) return 'DoesNotHavePermission';
    if (next === null) return null;
    if (isThrottled(ctx.commission, next.commission, ctx.block)) {
        return 'CommissionChangeThrottled';
    }
    if (aboveGlobal(ctx, next.commission)) return 'CommissionExceedsGlobalMaximum';
    const max = ctx.commission.max;
    if (max !== null && next.commission > max) return 'CommissionExceedsMaximum';
    return null;
}

/** Why `setCommissionMax(max)` by `who` would fail, or null: a max only goes down. */
export function setCommissionMaxRefusal(
    ctx: CommissionContext,
    who: string | null,
    max: number
): CommissionRefusal | null {
    if (!isRoot(ctx, who)) return 'DoesNotHavePermission';
    if (aboveGlobal(ctx, max)) return 'CommissionExceedsGlobalMaximum';
    const current = ctx.commission.max;
    if (current !== null && max > current) return 'MaxCommissionRestricted';
    return null;
}

/** Why `setCommissionChangeRate(rate)` by `who` would fail, or null: a rate only gets stricter. */
export function setCommissionChangeRateRefusal(
    ctx: CommissionContext,
    who: string | null,
    rate: CommissionChangeRate
): CommissionRefusal | null {
    if (!isRoot(ctx, who)) return 'DoesNotHavePermission';
    const current = ctx.commission.changeRate;
    if (current && (rate.maxIncrease > current.maxIncrease || rate.minDelay < current.minDelay)) {
        return 'CommissionChangeRateNotAllowed';
    }
    return null;
}

/** Why `setCommissionClaimPermission` by `who` would fail, or null. */
export function setCommissionClaimPermissionRefusal(
    ctx: CommissionContext,
    who: string | null
): CommissionRefusal | null {
    return isRoot(ctx, who) ? null : 'DoesNotHavePermission';
}

/** Whether `who` may claim: the root always, anyone when permissionless, or the named account. */
export function canClaimCommission(ctx: CommissionContext, who: string): boolean {
    const permission = ctx.commission.claimPermission;
    if (ctx.roles.root === who || permission?.type === 'Permissionless') return true;
    return permission?.type === 'Account' && permission.account === who;
}

/**
 * Why `claimCommission` by `who` would fail, or null. `claimable` is what it would pay
 * (`Pool.rewards.commissionClaimable`).
 */
export function claimCommissionRefusal(
    ctx: CommissionContext,
    who: string | null,
    claimable: bigint
): CommissionRefusal | null {
    if (who !== null && !canClaimCommission(ctx, who)) return 'DoesNotHavePermission';
    if (claimable === 0n) return 'NoPendingCommission';
    if (ctx.commission.current === null) return 'NoCommissionCurrentSet';
    return null;
}

/**
 * What `claimCommission` would pay now: the recorded pending commission plus the
 * commission's share of rewards paid since the last record, as the chain's
 * `RewardPool::update_records` computes it (rounded down).
 */
export function claimableCommission(
    reward: {
        rewardBalance: bigint;
        totalRewardsClaimed: bigint;
        totalCommissionClaimed: bigint;
        totalCommissionPending: bigint;
        lastRecordedTotalPayouts: bigint;
    },
    rate: number
): bigint {
    const total = reward.rewardBalance + reward.totalRewardsClaimed + reward.totalCommissionClaimed;
    const unrecorded =
        total > reward.lastRecordedTotalPayouts ? total - reward.lastRecordedTotalPayouts : 0n;
    return reward.totalCommissionPending + (BigInt(rate) * unrecorded) / BigInt(PERBILL);
}
