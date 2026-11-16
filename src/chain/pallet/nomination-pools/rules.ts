/**
 * Runtime rules a member's actions answer to, mirrored for pre-flight: the chain stays
 * the authority, these spare a refused transaction.
 */
import { addressToAccountIdHex } from '../../../foundation/address';
import type { PoolMember, PoolsConfig, PoolSummary } from './types/index';

/**
 * What a pool's depositor keeps bonded after a partial unbond (`depositor_min_bond`):
 * the highest of the nominator, create and join minimums (the existential deposit is 0).
 */
export function poolDepositorMinBond(config: PoolsConfig, minNominatorBond: bigint): bigint {
    return [config.minCreateBond, config.minJoinBond].reduce(
        (a, b) => (a > b ? a : b),
        minNominatorBond
    );
}

const sameAccount = (a: string, b: string) =>
    a === b || (addressToAccountIdHex(a) ?? a) === (addressToAccountIdHex(b) ?? b);

/**
 * The most `member` can unbond now: everything, except for the pool's depositor, who
 * keeps `poolDepositorMinBond` in the pool until it is destroying and everyone else has
 * left.
 */
export function poolUnbondCap(
    member: Pick<PoolMember, 'account' | 'active'>,
    pool: Pick<PoolSummary, 'roles' | 'state' | 'memberCount'>,
    config: PoolsConfig,
    minNominatorBond: bigint
): bigint {
    if (!sameAccount(pool.roles.depositor, member.account)) return member.active;
    if (pool.state === 'Destroying' && pool.memberCount === 1) return member.active;
    const cap = member.active - poolDepositorMinBond(config, minNominatorBond);
    return cap > 0n ? cap : 0n;
}
