/**
 * Nomination pool state and call parameters as this SDK exposes them: amounts and
 * points in planck (`bigint`), accounts in SS58, commissions in `Perbill` parts (0..1e9).
 */

/**
 * `Open` takes new members. `Blocked` takes none, and its root or bouncer may unbond
 * members. `Destroying` is final: anyone may unbond members, so the pool can empty.
 */
export type PoolState = 'Open' | 'Blocked' | 'Destroying';

/**
 * Who besides the member may act on its rewards: `claimPayoutOther` needs
 * `PermissionlessWithdraw`, `bondExtraOther` needs `PermissionlessCompound`, and
 * `PermissionlessAll` allows both.
 */
export type ClaimPermission =
    | 'Permissioned'
    | 'PermissionlessCompound'
    | 'PermissionlessWithdraw'
    | 'PermissionlessAll';

/** What a pool bond adds: an amount from the free balance, or the pending rewards. */
export type PoolBondExtra = { type: 'FreeBalance'; amount: bigint } | { type: 'Rewards' };

/** `nominationPools.create`'s parameters: the first bond and the three roles. */
export interface CreatePoolParams {
    amount: bigint;
    root: string;
    nominator: string;
    bouncer: string;
}

/** Chain-wide pool parameters and counters. Limits are null when uncapped. */
export interface PoolsConfig {
    minJoinBond: bigint;
    minCreateBond: bigint;
    maxPools: number | null;
    maxPoolMembers: number | null;
    maxPoolMembersPerPool: number | null;
    /** In `Perbill` parts. */
    globalMaxCommission: number | null;
    poolCount: number;
    memberCount: number;
    lastPoolId: number;
    /** Bonded by every pool together, in planck. */
    totalValueLocked: bigint;
}

/** A pool's roles. The depositor is fixed; the others can be unset. */
export interface PoolRoles {
    depositor: string;
    root: string | null;
    nominator: string | null;
    bouncer: string | null;
}

/**
 * How a pool's commission may rise: by at most `maxIncrease` (`Perbill` parts) per change,
 * at least `minDelay` blocks apart. Decreases are never throttled.
 */
export interface CommissionChangeRate {
    maxIncrease: number;
    minDelay: number;
}

/** Who besides the root may claim a pool's commission: anyone, or one account. */
export type CommissionClaimPermission =
    | { type: 'Permissionless' }
    | { type: 'Account'; account: string };

/** `setCommission`'s rate in `Perbill` parts and the account every later claim pays. */
export interface NewPoolCommission {
    commission: number;
    payee: string;
}

/** A pool's commission on its members' rewards. */
export interface PoolCommission {
    /** The rate in `Perbill` parts and the account paid; null when the pool takes none. */
    current: { rate: number; payee: string } | null;
    /** Can only be lowered once set. */
    max: number | null;
    /** Can only be made stricter once set. */
    changeRate: CommissionChangeRate | null;
    /** The block the change rate counts `minDelay` from: the last change. */
    throttleFrom: number | null;
    /** Who besides the root may claim it; null for the root only. */
    claimPermission: CommissionClaimPermission | null;
}

/**
 * Why the chain would refuse a commission call, by its error name: not the root (or not
 * allowed to claim), above the global or the pool's max, a max above the current one, a
 * looser change rate, an increase the change rate throttles, or nothing to claim.
 */
export type CommissionRefusal =
    | 'DoesNotHavePermission'
    | 'CommissionExceedsGlobalMaximum'
    | 'CommissionExceedsMaximum'
    | 'MaxCommissionRestricted'
    | 'CommissionChangeRateNotAllowed'
    | 'CommissionChangeThrottled'
    | 'NoPendingCommission'
    | 'NoCommissionCurrentSet';

/** A pool as listed: one entry of `BondedPools` with its metadata. */
export interface PoolSummary {
    id: number;
    state: PoolState;
    /** Points issued; they track the bonded balance 1:1 until a slash. */
    points: bigint;
    memberCount: number;
    roles: PoolRoles;
    commission: PoolCommission;
    /** The name the root set (`set_metadata`), as UTF-8; empty when none. */
    metadata: string;
}

/** A pool read in full: its accounts, balance, nominations and reward totals. */
export interface Pool extends PoolSummary {
    /** The keyless account staking bonds (a virtual staker: members' funds stay with them). */
    bondedAccount: string;
    /** The keyless account rewards are paid into until members claim them. */
    rewardAccount: string;
    /** Bonded balance backing the points, in planck. */
    balance: bigint;
    /** The validators the pool nominates, or null while it does not. */
    nominations: string[] | null;
    rewards: {
        totalClaimed: bigint;
        /** Commission recorded as pending, in planck. */
        commissionPending: bigint;
        /** What `claimCommission` would pay now: the pending commission plus the share of rewards not yet recorded. */
        commissionClaimable: bigint;
        commissionClaimed: bigint;
    };
}

/** A deferred slash that reaches a pool when it applies, in `era`. */
export interface PoolPendingSlash {
    era: number;
    /** The offending validator the pool nominated. */
    validator: string;
    /** What the pool loses, in planck. */
    amount: bigint;
}

/** Points a member unbonds, withdrawable from `era` (`withdrawUnbonded`). */
export interface PoolUnbondingChunk {
    era: number;
    points: bigint;
}

/** One member's position in its pool. */
export interface PoolMember {
    account: string;
    poolId: number;
    /** Points still bonded. */
    points: bigint;
    /** What `points` are worth now, in planck. */
    active: bigint;
    /** Bonded plus unbonding, in planck (`member_total_balance`). */
    total: bigint;
    unbonding: PoolUnbondingChunk[];
    /** Rewards `claimPayout` would pay now, in planck. */
    pendingRewards: bigint;
    claimPermission: ClaimPermission;
}
