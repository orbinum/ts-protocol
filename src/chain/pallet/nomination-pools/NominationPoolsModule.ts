import type { SignerTxCreator as SubstrateSigner } from 'polkadot-api/tx-creator';
import type { SubstrateClient } from '../../substrate/SubstrateClient';
import type { TxResult } from '../../client/types';
import { callUnsafeTx, resolveTx, signAndSubmitTx, type SubmitOptions } from '../../tx';
import {
    readBlockedTargets,
    readIsStaker,
    readNominationTargets,
    readNonCandidates,
} from '../staking/storage/reads';
import { signerAccount } from '../signerAccount';
import {
    bondExtraCallArgs,
    bondExtraOtherCallArgs,
    chillCallArgs,
    claimCommissionCallArgs,
    claimPayoutOtherCallArgs,
    createCallArgs,
    joinCallArgs,
    nominateCallArgs,
    poolWithdrawUnbondedCallArgs,
    setClaimPermissionCallArgs,
    setCommissionCallArgs,
    setCommissionChangeRateCallArgs,
    setCommissionClaimPermissionCallArgs,
    setCommissionMaxCallArgs,
    setStateCallArgs,
    unbondCallArgs,
    withdrawUnbondedCallArgs,
} from './calls/callArgs';
import {
    claimCommissionRefusal,
    setCommissionChangeRateRefusal,
    setCommissionClaimPermissionRefusal,
    setCommissionMaxRefusal,
    setCommissionRefusal,
    type CommissionContext,
} from './commission';
import {
    readCommissionContext,
    readPointsToBalance,
    readMinJoinBond,
    readPool,
    readPoolBondedAccount,
    readPoolMember,
    readPoolPendingRewards,
    readPoolPendingSlashes,
    readPools,
    readPoolsConfig,
} from './storage/reads';
import type {
    ClaimPermission,
    CommissionChangeRate,
    CommissionClaimPermission,
    CommissionRefusal,
    CreatePoolParams,
    NewPoolCommission,
    Pool,
    PoolBondExtra,
    PoolMember,
    PoolPendingSlash,
    PoolsConfig,
    PoolState,
    PoolSummary,
} from './types/index';

/**
 * Nomination pools (`pallet-nomination-pools` over `pallet-delegated-staking`):
 * stake below the nominator minimum by joining a pool, which nominates as one.
 * Members' funds stay in their own accounts, held as a delegation to the pool.
 *
 * Every call here is text-signable (ed25519 and EVM accounts). Metadata and role
 * changes are not, and are not wrapped: sign them with an sr25519 account through the
 * UnsafeApi. The commission calls check the pool's rules before signing
 * (`./commission`), so a wallet is not asked to sign what the chain would refuse.
 */
export class NominationPoolsModule {
    constructor(private readonly substrate: SubstrateClient) {}

    // ─── Reads ─────────────────────────────────────────────────────────────────

    /** Minimum bonds, limits, the commission cap and the counters. */
    config(): Promise<PoolsConfig> {
        return readPoolsConfig(this.substrate);
    }

    /** Every pool with its state, points, roles, commission and name. */
    pools(): Promise<PoolSummary[]> {
        return readPools(this.substrate);
    }

    /** Pool `id` with its accounts, balance, nominations and reward totals, or null. */
    pool(id: number): Promise<Pool | null> {
        return readPool(this.substrate, id);
    }

    /** `account`'s points, balance, unbonding chunks, pending rewards and claim permission, or null. */
    member(account: string): Promise<PoolMember | null> {
        return readPoolMember(this.substrate, account);
    }

    /** Rewards `claimPayout` would pay `account` now. */
    pendingRewards(account: string): Promise<bigint> {
        return readPoolPendingRewards(this.substrate, account);
    }

    /**
     * Deferred slashes that will reach pool `id` (`readPoolPendingSlashes`): show them
     * before someone joins, since a new member pays a share too.
     */
    pendingSlashes(id: number): Promise<PoolPendingSlash[]> {
        return readPoolPendingSlashes(this.substrate, id);
    }

    /** What `points` of pool `id` are worth now, in planck. */
    pointsToBalance(id: number, points: bigint): Promise<bigint> {
        return readPointsToBalance(this.substrate, id, points);
    }

    // ─── Member calls ──────────────────────────────────────────────────────────

    /**
     * Joins pool `id` with `amount`; an account is in one pool at most. Refused before
     * signing below `MinJoinBond`, or when the signer stakes directly: the chain keeps the
     * two apart (`Restricted`), after the fee.
     */
    join(amount: bigint, id: number, signer: SubstrateSigner, options?: SubmitOptions) {
        const args = joinCallArgs(amount, id);
        return this.refuseJoin(amount, signer).then(() =>
            this.submit('join', args, signer, options)
        );
    }

    private async refuseJoin(amount: bigint, signer: SubstrateSigner): Promise<void> {
        const who = signerAccount(signer);
        const [min, staker] = await Promise.all([
            readMinJoinBond(this.substrate),
            who ? readIsStaker(this.substrate, who) : false,
        ]);
        if (amount < min) throw new Error(`join.amount: below the ${min} planck minimum`);
        if (staker) throw new Error('join: the account stakes directly; leave staking first');
    }

    /** Bonds more into the signer's pool: from the free balance, or its pending rewards. */
    bondExtra(extra: PoolBondExtra, signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('bond_extra', bondExtraCallArgs(extra), signer, options);
    }

    /** Restakes `member`'s pending rewards; `member` must allow it (`PermissionlessCompound`). */
    bondExtraOther(member: string, signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('bond_extra_other', bondExtraOtherCallArgs(member), signer, options);
    }

    /** Pays the signer's pending rewards to its free balance. */
    claimPayout(signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('claim_payout', {}, signer, options);
    }

    /** Pays `member`'s pending rewards to it; `member` must allow it (`PermissionlessWithdraw`). */
    claimPayoutOther(member: string, signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('claim_payout_other', claimPayoutOtherCallArgs(member), signer, options);
    }

    /**
     * Starts unbonding `points` of `member` (the signer itself, or a member the pool's
     * state lets the signer unbond). Pending rewards are paid out first.
     */
    unbond(member: string, points: bigint, signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('unbond', unbondCallArgs(member, points), signer, options);
    }

    /** Frees `member`'s chunks whose unbonding era has come. */
    withdrawUnbonded(member: string, signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('withdraw_unbonded', withdrawUnbondedCallArgs(member), signer, options);
    }

    /** Withdraws pool `id`'s unlocked chunks from staking into its unbonding pools. Anyone may call it. */
    poolWithdrawUnbonded(id: number, signer: SubstrateSigner, options?: SubmitOptions) {
        const args = poolWithdrawUnbondedCallArgs(id);
        return this.submit('pool_withdraw_unbonded', args, signer, options);
    }

    /** Who besides the signer may claim or restake its rewards. */
    setClaimPermission(
        permission: ClaimPermission,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ) {
        const args = setClaimPermissionCallArgs(permission);
        return this.submit('set_claim_permission', args, signer, options);
    }

    // ─── Pool operator calls ───────────────────────────────────────────────────

    /** Creates a pool bonding `amount` (at least `MinCreateBond`); the signer is its depositor. */
    create(params: CreatePoolParams, signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('create', createCallArgs(params), signer, options);
    }

    /**
     * Nominates `validators` for pool `id` (root or nominator), replacing the current list.
     * Refused before signing, as `staking.nominate`, when a new target is not a validator
     * candidate or blocks new nominations (`BadTarget`, after the fee); the pool's current
     * targets are kept whatever they are now.
     */
    async nominate(
        id: number,
        validators: string[],
        signer: SubstrateSigner,
        options?: SubmitOptions
    ) {
        const args = nominateCallArgs(id, validators);
        const current = await readPoolBondedAccount(this.substrate, id).then((bonded) =>
            readNominationTargets(this.substrate, bonded)
        );
        const [missing, blocked] = await Promise.all([
            readNonCandidates(this.substrate, args.validators),
            readBlockedTargets(this.substrate, args.validators),
        ]);
        const notValidating = missing.filter((v) => !current.includes(v));
        if (notValidating.length) {
            throw new Error(`nominate.validators: not a validator: ${notValidating.join(', ')}`);
        }
        const refused = blocked.filter((v) => !current.includes(v));
        if (refused.length) {
            throw new Error(`nominate.validators: blocks new nominations: ${refused.join(', ')}`);
        }
        return this.submit('nominate', args, signer, options);
    }

    /** Opens, blocks or starts destroying pool `id` (root or bouncer). */
    setState(id: number, state: PoolState, signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('set_state', setStateCallArgs(id, state), signer, options);
    }

    /** Stops pool `id` nominating (root or nominator); its bond stays. */
    chill(id: number, signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('chill', chillCallArgs(id), signer, options);
    }

    // ─── Pool commission (root) ────────────────────────────────────────────────

    /**
     * Sets pool `id`'s commission to `next.commission` (`Perbill` parts) paid to
     * `next.payee`, or removes it (`null`). Refused before signing when the signer is not
     * the root, the rate is above the pool's or the global max, or the change rate
     * throttles the increase. A zero rate removes the commission.
     */
    async setCommission(
        id: number,
        next: NewPoolCommission | null,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ) {
        const args = setCommissionCallArgs(id, next);
        const payee = args.new_commission?.[1] as string | undefined;
        const checked = next && payee !== undefined ? { commission: next.commission, payee } : null;
        await this.checkCommission('setCommission', id, signer, (ctx, who) =>
            setCommissionRefusal(ctx, who, checked)
        );
        return this.submit('set_commission', args, signer, options);
    }

    /** Sets pool `id`'s max commission. Once set it can only go down: lowering is irreversible. */
    async setCommissionMax(
        id: number,
        max: number,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ) {
        const args = setCommissionMaxCallArgs(id, max);
        await this.checkCommission('setCommissionMax', id, signer, (ctx, who) =>
            setCommissionMaxRefusal(ctx, who, max)
        );
        return this.submit('set_commission_max', args, signer, options);
    }

    /** Sets how fast pool `id`'s commission may rise. Once set it can only get stricter. */
    async setCommissionChangeRate(
        id: number,
        rate: CommissionChangeRate,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ) {
        const args = setCommissionChangeRateCallArgs(id, rate);
        await this.checkCommission('setCommissionChangeRate', id, signer, (ctx, who) =>
            setCommissionChangeRateRefusal(ctx, who, rate)
        );
        return this.submit('set_commission_change_rate', args, signer, options);
    }

    /**
     * Pays pool `id`'s pending commission to its payee, whoever claims. Refused before
     * signing when the claim permission does not allow the signer or nothing is pending.
     */
    async claimCommission(id: number, signer: SubstrateSigner, options?: SubmitOptions) {
        const args = claimCommissionCallArgs(id);
        const pool = await readPool(this.substrate, id);
        const claimable = pool?.rewards.commissionClaimable ?? 0n;
        await this.checkCommission('claimCommission', id, signer, (ctx, who) =>
            claimCommissionRefusal(ctx, who, claimable)
        );
        return this.submit('claim_commission', args, signer, options);
    }

    /** Lets anyone, or one account, claim pool `id`'s commission besides the root; `null` for the root only. */
    async setCommissionClaimPermission(
        id: number,
        permission: CommissionClaimPermission | null,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ) {
        const args = setCommissionClaimPermissionCallArgs(id, permission);
        await this.checkCommission('setCommissionClaimPermission', id, signer, (ctx, who) =>
            setCommissionClaimPermissionRefusal(ctx, who)
        );
        return this.submit('set_commission_claim_permission', args, signer, options);
    }

    /** Throws what the chain would refuse pool `id`'s commission call with, before signing. */
    private async checkCommission(
        where: string,
        id: number,
        signer: SubstrateSigner,
        refusal: (ctx: CommissionContext, who: string | null) => CommissionRefusal | null
    ): Promise<void> {
        const ctx = await readCommissionContext(this.substrate, id);
        if (!ctx) throw new Error(`${where}: no pool ${id}`);
        const reason = refusal(ctx, signerAccount(signer));
        if (reason) throw new Error(`${where}: ${reason}`);
    }

    private submit(
        call: string,
        args: Record<string, unknown>,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ): Promise<TxResult> {
        const tx = callUnsafeTx(resolveTx(this.substrate.unsafe, 'NominationPools', call), args);
        return signAndSubmitTx(tx, signer, options);
    }
}
