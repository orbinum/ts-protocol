/**
 * A call the SDK refuses before signing because the chain would refuse it (and still
 * take the fee): a minimum not met, a role missing, a target that cannot be nominated.
 *
 * Hosts switch on `reason` and read the numbers from `detail`; `message` is for logs
 * and stays as readable as before. Malformed arguments are not refusals: they throw a
 * plain `Error`, as a programming mistake.
 */
import type { CommissionRefusal } from './pallet/nomination-pools/types/index';
import type { PoolProfileRefusal } from './pallet/nomination-pools/metadata';

/** Why the chain would refuse the call. */
export type RefusalReason =
    // Staking
    | 'NotValidator'
    | 'BlocksNominations'
    | 'CommissionAboveMax'
    | 'CommissionBelowMin'
    | 'InNominationPool'
    | 'BelowMinimumBond'
    | 'RemainderBelowRoleMinimum'
    | 'KickLeavesNoTarget'
    // Nomination pools
    | 'BelowMinimumJoin'
    | 'StakesDirectly'
    | 'PoolIdInUse'
    | 'InvalidPoolId'
    | 'NoSuchPool'
    | CommissionRefusal
    | PoolProfileRefusal
    // Private staking
    | 'NotRoot'
    | 'PoolNotOpen'
    | 'NotPrivate';

/** The numbers behind a refusal, by reason (accounts as given, amounts in planck). */
export interface RefusalDetail {
    /** `NotValidator`, `BlocksNominations`: the targets at fault. */
    targets?: string[];
    /** `KickLeavesNoTarget`: nominators left with no target. */
    nominators?: string[];
    /** The floor not met (`BelowMinimumBond`, `BelowMinimumJoin`, `RemainderBelowRoleMinimum`). */
    minimum?: bigint;
    /** `CommissionAboveMax` / `CommissionBelowMin`: the bound, in Perbill parts. */
    bound?: number;
    /** `RemainderBelowRoleMinimum`: what would stay bonded, and the role it is short for. */
    left?: bigint;
    role?: 'nominator' | 'validator';
    /** `BelowMinimumBond`: the amount checked (`bond.value`, `bond_extra.max_additional`, …). */
    field?: string;
    poolId?: number;
}

export class ProtocolRefusal extends Error {
    override readonly name = 'ProtocolRefusal';

    constructor(
        /** The SDK call refused (`bond`, `nominate`, `setCommission`, `setPrivate`…). */
        readonly call: string,
        readonly reason: RefusalReason,
        message: string,
        readonly detail: RefusalDetail = {}
    ) {
        super(message);
    }
}

/**
 * `error` as a `ProtocolRefusal`, or null. Matched by shape as well as by class, so
 * a refusal thrown by another copy of this package (a bundler duplicate) still reads.
 */
export function protocolRefusal(error: unknown): ProtocolRefusal | null {
    if (error instanceof ProtocolRefusal) return error;
    if (
        error instanceof Error &&
        error.name === 'ProtocolRefusal' &&
        typeof (error as Partial<ProtocolRefusal>).reason === 'string' &&
        typeof (error as Partial<ProtocolRefusal>).call === 'string'
    ) {
        return error as ProtocolRefusal;
    }
    return null;
}
