/**
 * `PrivateStaking` storage and constants, read through PAPI's UnsafeApi at the best block.
 */
import type { SubstrateClient } from '../../../substrate/SubstrateClient';
import { assertU32 } from '../../staking/calls/callArgs';
import {
    readMinJoinBond,
    readPointsToBalance,
    readPool,
} from '../../nomination-pools/storage/reads';
import { readMinSpendFee } from '../../shielded-pool/storage/reads';
import { readNominatorUnbondDuration } from '../../staking/storage/reads';
import { privateMemberAddress } from '../account';
import type {
    PrivateExitState,
    PrivatePool,
    PrivatePoolQuote,
    PrivateWindDown,
} from '../types/index';

type Num = bigint | number | string;
type At = { at: 'best' };
const BEST: At = { at: 'best' };

type RawWindDown = { value: Num; liquid: Num; unlock_era: number; withdrawn: boolean };
type RawPool = {
    asset_id: number;
    enabled: boolean;
    supply: Num;
    compounded_era?: number;
    wind_down?: RawWindDown;
};

type Value<T> = { getValue(at?: At): Promise<T> };
type StorageMap<K extends unknown[], T> = {
    getValue(...args: [...K, At?]): Promise<T>;
    getEntries(at?: At): Promise<{ keyArgs: K; value: T }[]>;
};

type PrivateReads = {
    query: {
        PrivateStaking: {
            Pools: StorageMap<[number], RawPool | undefined>;
            AssetPool: StorageMap<[number], number | undefined>;
            EntryPoints: StorageMap<[number], Num>;
            Entries: {
                getEntries(
                    poolId: number,
                    at?: At
                ): Promise<{ keyArgs: [number, [number, number]]; value: unknown[] }[]>;
            };
            MinEntry: Value<Num>;
        };
        NominationPools: {
            PoolMembers: StorageMap<
                [string],
                { points: Num; unbonding_eras: [number, Num][] } | undefined
            >;
        };
        Staking: {
            ActiveEra: Value<{ index: number } | undefined>;
            MinNominatorBond: Value<Num>;
        };
    };
    constants: {
        PrivateStaking: {
            VirtualOffset(): Promise<Num>;
            MaxQueue(): Promise<number>;
            MaxPages(): Promise<number>;
        };
        NominationPools: { MaxUnbonding(): Promise<number>; MaxPointsToBalance(): Promise<number> };
    };
};

const reads = (substrate: SubstrateClient) => substrate.unsafe as unknown as PrivateReads;

function windDown(raw: RawWindDown | undefined): PrivateWindDown | null {
    return raw
        ? {
              value: BigInt(raw.value),
              liquid: BigInt(raw.liquid),
              unlockEra: raw.unlock_era,
              withdrawn: raw.withdrawn,
          }
        : null;
}

function privatePool(poolId: number, raw: RawPool): PrivatePool {
    return {
        poolId,
        assetId: raw.asset_id,
        enabled: raw.enabled,
        supply: BigInt(raw.supply),
        compoundedEra: raw.compounded_era ?? null,
        windDown: windDown(raw.wind_down),
    };
}

/** Pool `poolId`'s private side, or null if its root never opened it. */
export async function readPrivatePool(
    substrate: SubstrateClient,
    poolId: number
): Promise<PrivatePool | null> {
    assertU32(poolId, 'privateStaking.poolId');
    const raw = await reads(substrate).query.PrivateStaking.Pools.getValue(poolId, BEST);
    return raw ? privatePool(poolId, raw) : null;
}

/** Every pool ever opened to private members, by pool id. */
export async function readPrivatePools(substrate: SubstrateClient): Promise<PrivatePool[]> {
    const entries = await reads(substrate).query.PrivateStaking.Pools.getEntries(BEST);
    return entries
        .filter((e) => e.value !== undefined)
        .map((e) => privatePool(e.keyArgs[0], e.value!))
        .toSorted((a, b) => a.poolId - b.poolId);
}

/** The pool a share asset belongs to, or null for any other asset. */
export async function readPrivatePoolOfAsset(
    substrate: SubstrateClient,
    assetId: number
): Promise<number | null> {
    assertU32(assetId, 'privateStaking.assetId');
    return (await reads(substrate).query.PrivateStaking.AssetPool.getValue(assetId, BEST)) ?? null;
}

/** The smallest private entry, in planck. */
export async function readMinPrivateEntry(substrate: SubstrateClient): Promise<bigint> {
    return BigInt(await reads(substrate).query.PrivateStaking.MinEntry.getValue(BEST));
}

/** What prices pool `poolId`'s shares now, or null if it is not private. */
export async function readPrivateQuote(
    substrate: SubstrateClient,
    poolId: number
): Promise<PrivatePoolQuote | null> {
    const api = reads(substrate);
    const [pool, member, pending, offset] = await Promise.all([
        readPrivatePool(substrate, poolId),
        api.query.NominationPools.PoolMembers.getValue(privateMemberAddress(poolId), BEST),
        api.query.PrivateStaking.EntryPoints.getValue(poolId, BEST),
        api.constants.PrivateStaking.VirtualOffset(),
    ]);
    if (!pool) return null;
    const points = member ? BigInt(member.points) : 0n;
    const minted = points > BigInt(pending) ? points - BigInt(pending) : 0n;
    const netValue = minted > 0n ? await readPointsToBalance(substrate, poolId, minted) : 0n;
    return {
        poolId,
        assetId: pool.assetId,
        supply: pool.supply,
        netValue,
        virtualOffset: BigInt(offset),
        windDown: pool.windDown,
    };
}

/**
 * Eras an exit (or a refunded entry) waits before its ORB is minted: the nominator
 * unbonding the pallet gets (`nominator_bonding_duration`) — the fast unbond while
 * nominators are not slashable, the full bonding duration otherwise.
 */
export function readExitUnbondingEras(substrate: SubstrateClient): Promise<number> {
    return readNominatorUnbondDuration(substrate);
}

/**
 * What decides whether an exit from pool `poolId` is admitted (`privateExitRefusal`), or
 * null if the pool is not private or no longer exists.
 */
export async function readPrivateExitState(
    substrate: SubstrateClient,
    poolId: number
): Promise<PrivateExitState | null> {
    const { query, constants } = reads(substrate);
    const [quote, pool, member, pending, minJoinBond, minNominatorBond, minSpendFee] =
        await Promise.all([
            readPrivateQuote(substrate, poolId),
            readPool(substrate, poolId),
            query.NominationPools.PoolMembers.getValue(privateMemberAddress(poolId), BEST),
            query.PrivateStaking.EntryPoints.getValue(poolId, BEST),
            readMinJoinBond(substrate),
            query.Staking.MinNominatorBond.getValue(BEST),
            readMinSpendFee(substrate),
        ]);
    if (!quote || !pool) return null;
    const [memberValue, maxUnbonding, era, unbonding] = await Promise.all([
        member ? readPointsToBalance(substrate, poolId, BigInt(member.points)) : 0n,
        constants.NominationPools.MaxUnbonding(),
        query.Staking.ActiveEra.getValue(BEST),
        readExitUnbondingEras(substrate),
    ]);
    return {
        quote,
        memberValue,
        pendingEntryPoints: BigInt(pending),
        poolStake: pool.balance,
        nominating: pool.nominations !== null,
        minJoinBond,
        minNominatorBond: BigInt(minNominatorBond),
        minSpendFee,
        unbondingEras: (member?.unbonding_eras ?? []).map(([e]) => e),
        maxUnbonding,
        unlockEra: (era?.index ?? 0) + unbonding,
    };
}

/** `NominationPools.MaxPointsToBalance`: a pool slashed to this points-per-planck takes no one. */
export async function readMaxPointsToBalance(substrate: SubstrateClient): Promise<number> {
    return reads(substrate).constants.NominationPools.MaxPointsToBalance();
}

/**
 * Whether pool `poolId` takes no more entries in era `era`: every one of its `MaxPages`
 * entry pages holds `MaxQueue` entries.
 */
export async function readEntryQueueFull(
    substrate: SubstrateClient,
    poolId: number,
    era: number
): Promise<boolean> {
    const { query, constants } = reads(substrate);
    const [pages, maxQueue, maxPages] = await Promise.all([
        query.PrivateStaking.Entries.getEntries(poolId, BEST),
        constants.PrivateStaking.MaxQueue(),
        constants.PrivateStaking.MaxPages(),
    ]);
    const full = pages.filter(
        ({ keyArgs: [, [e]], value }) => e === era && value.length >= maxQueue
    );
    return full.length >= maxPages;
}

/** The active era, or 0 before the first. */
export async function readActiveEra(substrate: SubstrateClient): Promise<number> {
    return (await reads(substrate).query.Staking.ActiveEra.getValue(BEST))?.index ?? 0;
}
