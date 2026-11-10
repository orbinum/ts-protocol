/**
 * `NominationPools` storage and the `NominationPoolsApi` runtime API, read through
 * PAPI's UnsafeApi.
 *
 * `PoolsReads` is the slice of the untyped UnsafeApi these reads use, so a renamed
 * item fails here rather than at every call site.
 */
import type { SubstrateClient } from '../../../substrate/SubstrateClient';
import { assertU32 } from '../../staking/calls/callArgs';
import { toSs58 } from '../../staking/storage/reads';
import { claimableCommission, effectiveCommission, type CommissionContext } from '../commission';
import type {
    ClaimPermission,
    Pool,
    PoolCommission,
    PoolMember,
    PoolPendingSlash,
    PoolsConfig,
    PoolState,
    PoolSummary,
} from '../types/index';

type Enum<T extends string, V = undefined> = { type: T; value: V };
type Num = bigint | number | string;
/** Pools and members a user's own transactions change are read at the best block. */
type At = { at: 'best' };
const BEST: At = { at: 'best' };

type RawBondedPool = {
    commission: {
        current?: [number, string];
        max?: number;
        change_rate?: { max_increase: number; min_delay: number };
        throttle_from?: number;
        claim_permission?: Enum<'Permissionless'> | Enum<'Account', string>;
    };
    member_counter: number;
    points: Num;
    roles: { depositor: string; root?: string; nominator?: string; bouncer?: string };
    state: Enum<PoolState>;
};

type RawRewardPool = {
    last_recorded_total_payouts: Num;
    total_rewards_claimed: Num;
    total_commission_pending: Num;
    total_commission_claimed: Num;
};

type RawMember = {
    pool_id: number;
    points: Num;
    unbonding_eras: [number, Num][];
};

type Value<T> = { getValue(at?: At): Promise<T> };
type StorageMap<K extends unknown[], T> = {
    getValue(...args: [...K, At?]): Promise<T>;
    getEntries(at?: At): Promise<{ keyArgs: K; value: T }[]>;
};

/** The slice of PAPI's UnsafeApi the pool reads use. */
type PoolsReads = {
    query: {
        NominationPools: {
            MinJoinBond: Value<Num>;
            MinCreateBond: Value<Num>;
            MaxPools: Value<number | undefined>;
            MaxPoolMembers: Value<number | undefined>;
            MaxPoolMembersPerPool: Value<number | undefined>;
            GlobalMaxCommission: Value<number | undefined>;
            CounterForBondedPools: Value<number>;
            CounterForPoolMembers: Value<number>;
            LastPoolId: Value<number>;
            TotalValueLocked: Value<Num>;
            BondedPools: StorageMap<[number], RawBondedPool | undefined>;
            RewardPools: StorageMap<[number], RawRewardPool | undefined>;
            Metadata: StorageMap<[number], Uint8Array>;
            PoolMembers: StorageMap<[string], RawMember | undefined>;
            ClaimPermissions: StorageMap<[string], Enum<ClaimPermission>>;
        };
        Staking: {
            Nominators: StorageMap<[string], { targets: string[] } | undefined>;
            UnappliedSlashes: StorageMap<
                [number, [string, number, number]],
                { validator: string; others: [string, Num][] } | undefined
            >;
            CancelledSlashes: StorageMap<[number], [string, number][]>;
        };
        System: {
            Number: Value<number>;
            Account: StorageMap<[string], { data: { free: Num; frozen: Num } }>;
        };
    };
    apis: {
        NominationPoolsApi: {
            pool_accounts(poolId: number, at?: At): Promise<[string, string]>;
            pool_balance(poolId: number, at?: At): Promise<Num>;
            points_to_balance(poolId: number, points: bigint, at?: At): Promise<Num>;
            pending_rewards(who: string, at?: At): Promise<Num>;
            member_total_balance(who: string, at?: At): Promise<Num>;
        };
    };
};

function reads(substrate: SubstrateClient): PoolsReads {
    return substrate.unsafe as unknown as PoolsReads;
}

const optional = (v: number | undefined): number | null => (v === undefined ? null : v);

/** Metadata bytes as UTF-8; invalid sequences become U+FFFD rather than failing the read. */
const utf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

function commission(raw: RawBondedPool['commission']): PoolCommission {
    const claim = raw.claim_permission;
    return {
        current: raw.current ? { rate: raw.current[0], payee: raw.current[1] } : null,
        max: optional(raw.max),
        changeRate: raw.change_rate
            ? { maxIncrease: raw.change_rate.max_increase, minDelay: raw.change_rate.min_delay }
            : null,
        throttleFrom: optional(raw.throttle_from),
        claimPermission: !claim
            ? null
            : claim.type === 'Account'
              ? { type: 'Account', account: claim.value }
              : { type: 'Permissionless' },
    };
}

function summary(id: number, raw: RawBondedPool, metadata: Uint8Array): PoolSummary {
    return {
        id,
        state: raw.state.type,
        points: BigInt(raw.points),
        memberCount: raw.member_counter,
        roles: {
            depositor: raw.roles.depositor,
            root: raw.roles.root ?? null,
            nominator: raw.roles.nominator ?? null,
            bouncer: raw.roles.bouncer ?? null,
        },
        commission: commission(raw.commission),
        metadata: utf8(metadata),
    };
}

/** Minimum bonds, limits, the commission cap and the counters. */
export async function readPoolsConfig(substrate: SubstrateClient): Promise<PoolsConfig> {
    const q = reads(substrate).query.NominationPools;
    const [
        minJoinBond,
        minCreateBond,
        maxPools,
        maxPoolMembers,
        maxPoolMembersPerPool,
        globalMaxCommission,
        poolCount,
        memberCount,
        lastPoolId,
        totalValueLocked,
    ] = await Promise.all([
        q.MinJoinBond.getValue(),
        q.MinCreateBond.getValue(),
        q.MaxPools.getValue(),
        q.MaxPoolMembers.getValue(),
        q.MaxPoolMembersPerPool.getValue(),
        q.GlobalMaxCommission.getValue(),
        q.CounterForBondedPools.getValue(),
        q.CounterForPoolMembers.getValue(),
        q.LastPoolId.getValue(),
        q.TotalValueLocked.getValue(),
    ]);
    return {
        minJoinBond: BigInt(minJoinBond),
        minCreateBond: BigInt(minCreateBond),
        maxPools: optional(maxPools),
        maxPoolMembers: optional(maxPoolMembers),
        maxPoolMembersPerPool: optional(maxPoolMembersPerPool),
        globalMaxCommission: optional(globalMaxCommission),
        poolCount,
        memberCount,
        lastPoolId,
        totalValueLocked: BigInt(totalValueLocked),
    };
}

/** Every pool with its metadata, by id. */
export async function readPools(substrate: SubstrateClient): Promise<PoolSummary[]> {
    const q = reads(substrate).query.NominationPools;
    const [pools, metadata] = await Promise.all([
        q.BondedPools.getEntries(BEST),
        q.Metadata.getEntries(BEST),
    ]);
    const names = new Map(metadata.map((m) => [m.keyArgs[0], m.value]));
    const list = pools
        .filter((p): p is { keyArgs: [number]; value: RawBondedPool } => p.value !== undefined)
        .map((p) => summary(p.keyArgs[0], p.value, names.get(p.keyArgs[0]) ?? new Uint8Array()));
    list.sort((a, b) => a.id - b.id);
    return list;
}

/** Pool `id` in full, or null when there is none. */
export async function readPool(substrate: SubstrateClient, id: number): Promise<Pool | null> {
    assertU32(id, 'pools.pool.poolId');
    const { query, apis } = reads(substrate);
    const q = query.NominationPools;
    const [bonded, reward, metadata, [bondedAccount, rewardAccount], balance] = await Promise.all([
        q.BondedPools.getValue(id, BEST),
        q.RewardPools.getValue(id, BEST),
        q.Metadata.getValue(id, BEST),
        apis.NominationPoolsApi.pool_accounts(id, BEST),
        apis.NominationPoolsApi.pool_balance(id, BEST),
    ]);
    if (!bonded) return null;
    const [nominations, rewardBalance, globalMax] = await Promise.all([
        query.Staking.Nominators.getValue(bondedAccount, BEST),
        readSpendable(substrate, rewardAccount),
        q.GlobalMaxCommission.getValue(BEST),
    ]);
    const pool = summary(id, bonded, metadata);
    const totals = {
        rewardBalance,
        totalRewardsClaimed: BigInt(reward?.total_rewards_claimed ?? 0),
        totalCommissionClaimed: BigInt(reward?.total_commission_claimed ?? 0),
        totalCommissionPending: BigInt(reward?.total_commission_pending ?? 0),
        lastRecordedTotalPayouts: BigInt(reward?.last_recorded_total_payouts ?? 0),
    };
    const rate = effectiveCommission(pool.commission, optional(globalMax));
    return {
        ...pool,
        bondedAccount,
        rewardAccount,
        balance: BigInt(balance),
        nominations: nominations ? [...nominations.targets] : null,
        rewards: {
            totalClaimed: totals.totalRewardsClaimed,
            commissionPending: totals.totalCommissionPending,
            commissionClaimable: claimableCommission(totals, rate),
            commissionClaimed: totals.totalCommissionClaimed,
        },
    };
}

/** What `account` can move: free less frozen (the reward account freezes its minimum balance). */
async function readSpendable(substrate: SubstrateClient, account: string): Promise<bigint> {
    const { data } = await reads(substrate).query.System.Account.getValue(account, BEST);
    const free = BigInt(data.free);
    const frozen = BigInt(data.frozen);
    return free > frozen ? free - frozen : 0n;
}

/**
 * What the commission rules read for pool `id` (`../commission`), at the best block; the
 * transaction lands in a later one. Null when there is no pool `id`.
 */
export async function readCommissionContext(
    substrate: SubstrateClient,
    id: number
): Promise<CommissionContext | null> {
    const { NominationPools, System } = reads(substrate).query;
    const [bonded, globalMax, best] = await Promise.all([
        NominationPools.BondedPools.getValue(id, BEST),
        NominationPools.GlobalMaxCommission.getValue(BEST),
        System.Number.getValue(BEST),
    ]);
    if (!bonded) return null;
    const pool = summary(id, bonded, new Uint8Array());
    return {
        roles: pool.roles,
        commission: pool.commission,
        globalMax: optional(globalMax),
        block: best + 1,
    };
}

/** Whether `account` is in a pool at the best block. */
export async function readIsPoolMember(
    substrate: SubstrateClient,
    account: string
): Promise<boolean> {
    const who = toSs58(account, 'pools.member');
    return (await reads(substrate).query.NominationPools.PoolMembers.getValue(who, BEST)) != null;
}

/** The least a member may join with (`MinJoinBond`), in planck. */
export async function readMinJoinBond(substrate: SubstrateClient): Promise<bigint> {
    return BigInt(await reads(substrate).query.NominationPools.MinJoinBond.getValue(BEST));
}

/** `account`'s membership, or null when it is in no pool. */
export async function readPoolMember(
    substrate: SubstrateClient,
    account: string
): Promise<PoolMember | null> {
    const who = toSs58(account, 'pools.member');
    const { query, apis } = reads(substrate);
    const q = query.NominationPools;
    const [member, permission, total, pending] = await Promise.all([
        q.PoolMembers.getValue(who, BEST),
        q.ClaimPermissions.getValue(who, BEST),
        apis.NominationPoolsApi.member_total_balance(who, BEST),
        apis.NominationPoolsApi.pending_rewards(who, BEST),
    ]);
    if (!member) return null;
    const points = BigInt(member.points);
    const active = points
        ? await apis.NominationPoolsApi.points_to_balance(member.pool_id, points, BEST)
        : 0n;
    return {
        account: who,
        poolId: member.pool_id,
        points,
        active: BigInt(active),
        total: BigInt(total),
        unbonding: member.unbonding_eras.map(([era, p]) => ({ era, points: BigInt(p) })),
        pendingRewards: BigInt(pending),
        claimPermission: permission.type,
    };
}

/** The keyless account pool `id` bonds and nominates with. */
export async function readPoolBondedAccount(
    substrate: SubstrateClient,
    id: number
): Promise<string> {
    assertU32(id, 'pools.poolId');
    const [bonded] = await reads(substrate).apis.NominationPoolsApi.pool_accounts(id, BEST);
    return bonded;
}

/**
 * Deferred slashes that will reach pool `id` when they apply (`Staking.UnappliedSlashes`
 * naming its bonded account, less those `Staking.CancelledSlashes` covers): every member
 * at that moment pays a share, including one who joins now. `era` is the era they apply
 * in. Empty when there is no pool `id`.
 */
export async function readPoolPendingSlashes(
    substrate: SubstrateClient,
    id: number
): Promise<PoolPendingSlash[]> {
    assertU32(id, 'pools.pendingSlashes.poolId');
    const { query, apis } = reads(substrate);
    const [[bonded], entries] = await Promise.all([
        apis.NominationPoolsApi.pool_accounts(id, BEST),
        query.Staking.UnappliedSlashes.getEntries(BEST),
    ]);
    const hits = entries.flatMap(({ keyArgs: [era, [validator, fraction]], value }) => {
        const hit = value?.others.find(([who]) => who === bonded);
        return hit ? [{ era, validator, fraction, amount: BigInt(hit[1]) }] : [];
    });
    // Governance may have cancelled one: staking skips it if the cancelled fraction covers it.
    const eras = [...new Set(hits.map((h) => h.era))];
    const cancelled = new Map(
        await Promise.all(
            eras.map(
                async (era) =>
                    [era, await query.Staking.CancelledSlashes.getValue(era, BEST)] as const
            )
        )
    );
    return hits
        .filter(
            (h) =>
                !(cancelled.get(h.era) ?? []).some(([v, f]) => v === h.validator && f >= h.fraction)
        )
        .map(({ era, validator, amount }) => ({ era, validator, amount }));
}

/** Rewards `account` could claim now (`NominationPoolsApi.pending_rewards`); 0 outside a pool. */
export async function readPoolPendingRewards(
    substrate: SubstrateClient,
    account: string
): Promise<bigint> {
    const who = toSs58(account, 'pools.pendingRewards');
    return BigInt(await reads(substrate).apis.NominationPoolsApi.pending_rewards(who, BEST));
}

/** What `points` of pool `id` are worth now (`NominationPoolsApi.points_to_balance`). */
export async function readPointsToBalance(
    substrate: SubstrateClient,
    id: number,
    points: bigint
): Promise<bigint> {
    assertU32(id, 'pools.pointsToBalance.poolId');
    return BigInt(
        await reads(substrate).apis.NominationPoolsApi.points_to_balance(id, points, BEST)
    );
}
