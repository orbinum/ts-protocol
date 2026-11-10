/**
 * Nomination pool call arguments in the shape PAPI's metadata-driven API takes,
 * checked before anything is signed.
 */
import { MAX_NOMINATIONS, PERBILL } from '../../staking/constants';
import { accountList, assertAmount, assertU32 } from '../../staking/calls/callArgs';
import { toSs58 } from '../../staking/storage/reads';
import type {
    ClaimPermission,
    CommissionChangeRate,
    CommissionClaimPermission,
    CreatePoolParams,
    NewPoolCommission,
    PoolBondExtra,
    PoolState,
} from '../types/index';

const POOL_STATES: readonly PoolState[] = ['Open', 'Blocked', 'Destroying'];
const CLAIM_PERMISSIONS: readonly ClaimPermission[] = [
    'Permissioned',
    'PermissionlessCompound',
    'PermissionlessWithdraw',
    'PermissionlessAll',
];

/** `num_slashing_spans` of the withdraw calls: only their weight reads it, and staking-async keeps no spans. */
const NO_SLASHING_SPANS = 0;

function poolId(id: number, where: string): number {
    assertU32(id, `${where}.poolId`);
    return id;
}

/** A unit enum variant as PAPI encodes it, or throws when `value` is not one of `variants`. */
function unitVariant<T extends string>(value: T, variants: readonly T[], where: string) {
    if (!variants.includes(value)) throw new Error(`${where}: not one of ${variants.join(', ')}`);
    return { type: value, value: undefined };
}

/** `BondExtra` as PAPI encodes it. */
export function bondExtraArg(extra: PoolBondExtra, where: string) {
    switch (extra?.type) {
        case 'FreeBalance':
            assertAmount(extra.amount, `${where}.amount`);
            return { type: 'FreeBalance', value: extra.amount };
        case 'Rewards':
            return { type: 'Rewards', value: undefined };
        default:
            throw new Error(`${where}: not FreeBalance or Rewards`);
    }
}

export function joinCallArgs(amount: bigint, id: number) {
    assertAmount(amount, 'join.amount');
    return { amount, pool_id: poolId(id, 'join') };
}

export function bondExtraCallArgs(extra: PoolBondExtra) {
    return { extra: bondExtraArg(extra, 'bondExtra.extra') };
}

/** Another member's rewards only: the chain refuses free balance from anyone but the member. */
export function bondExtraOtherCallArgs(member: string) {
    return {
        member: toSs58(member, 'bondExtraOther.member'),
        extra: { type: 'Rewards', value: undefined },
    };
}

export function claimPayoutOtherCallArgs(member: string) {
    return { other: toSs58(member, 'claimPayoutOther.member') };
}

export function unbondCallArgs(member: string, points: bigint) {
    assertAmount(points, 'unbond.points');
    return { member_account: toSs58(member, 'unbond.member'), unbonding_points: points };
}

export function withdrawUnbondedCallArgs(member: string) {
    return {
        member_account: toSs58(member, 'withdrawUnbonded.member'),
        num_slashing_spans: NO_SLASHING_SPANS,
    };
}

export function poolWithdrawUnbondedCallArgs(id: number) {
    return { pool_id: poolId(id, 'poolWithdrawUnbonded'), num_slashing_spans: NO_SLASHING_SPANS };
}

export function createCallArgs({ amount, root, nominator, bouncer }: CreatePoolParams) {
    assertAmount(amount, 'create.amount');
    return {
        amount,
        root: toSs58(root, 'create.root'),
        nominator: toSs58(nominator, 'create.nominator'),
        bouncer: toSs58(bouncer, 'create.bouncer'),
    };
}

export function nominateCallArgs(id: number, validators: string[]) {
    return {
        pool_id: poolId(id, 'nominate'),
        validators: accountList(validators, MAX_NOMINATIONS, 'nominate.validators'),
    };
}

export function setStateCallArgs(id: number, state: PoolState) {
    return {
        pool_id: poolId(id, 'setState'),
        state: unitVariant(state, POOL_STATES, 'setState.state'),
    };
}

export function chillCallArgs(id: number) {
    return { pool_id: poolId(id, 'chill') };
}

export function setClaimPermissionCallArgs(permission: ClaimPermission) {
    return {
        permission: unitVariant(permission, CLAIM_PERMISSIONS, 'setClaimPermission.permission'),
    };
}

function perbill(parts: number, where: string): number {
    if (!Number.isInteger(parts) || parts < 0 || parts > PERBILL) {
        throw new Error(`${where}: Perbill parts must be an integer from 0 to 1e9`);
    }
    return parts;
}

/** `Option<(Perbill, AccountId)>`: the rate and its payee, or none to remove the commission. */
export function setCommissionCallArgs(id: number, next: NewPoolCommission | null) {
    const pool_id = poolId(id, 'setCommission');
    if (next === null) return { pool_id, new_commission: undefined };
    if (typeof next !== 'object') throw new Error('setCommission: not a commission or null');
    return {
        pool_id,
        new_commission: [
            perbill(next.commission, 'setCommission.commission'),
            toSs58(next.payee, 'setCommission.payee'),
        ],
    };
}

export function setCommissionMaxCallArgs(id: number, max: number) {
    return {
        pool_id: poolId(id, 'setCommissionMax'),
        max_commission: perbill(max, 'setCommissionMax.max'),
    };
}

export function setCommissionChangeRateCallArgs(id: number, rate: CommissionChangeRate) {
    const pool_id = poolId(id, 'setCommissionChangeRate');
    if (typeof rate !== 'object' || rate === null) {
        throw new Error('setCommissionChangeRate: not a change rate');
    }
    assertU32(rate.minDelay, 'setCommissionChangeRate.minDelay');
    return {
        pool_id,
        change_rate: {
            max_increase: perbill(rate.maxIncrease, 'setCommissionChangeRate.maxIncrease'),
            min_delay: rate.minDelay,
        },
    };
}

export function claimCommissionCallArgs(id: number) {
    return { pool_id: poolId(id, 'claimCommission') };
}

/** `Option<CommissionClaimPermission>`: anyone, one account, or none for the root only. */
export function setCommissionClaimPermissionCallArgs(
    id: number,
    permission: CommissionClaimPermission | null
) {
    const pool_id = poolId(id, 'setCommissionClaimPermission');
    switch (permission === null ? null : permission?.type) {
        case null:
            return { pool_id, permission: undefined };
        case 'Permissionless':
            return { pool_id, permission: { type: 'Permissionless', value: undefined } };
        case 'Account': {
            const { account } = permission as { account: string };
            const value = toSs58(account, 'setCommissionClaimPermission.account');
            return { pool_id, permission: { type: 'Account', value } };
        }
        default:
            throw new Error('setCommissionClaimPermission: not Permissionless, Account or null');
    }
}
