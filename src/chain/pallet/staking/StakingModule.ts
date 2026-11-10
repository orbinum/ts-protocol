import type { SignerTxCreator as SubstrateSigner } from 'polkadot-api/tx-creator';
import type { SubstrateClient } from '../../substrate/SubstrateClient';
import type { TxResult } from '../../client/types';
import {
    callUnsafeTx,
    resolveTx,
    signAndSubmitTx,
    type SubmitOptions,
    type UnsafeTx,
} from '../../tx';
import { formatPercent } from '../../substrate/ed25519Text/summary';
import { readAutoPayout } from './autoPayout';
import { readIsPoolMember } from '../nomination-pools/storage/reads';
import { signerAccount } from '../signerAccount';
import {
    amountCallArgs,
    bondCallArgs,
    bondExtraCallArgs,
    kickCallArgs,
    nominateCallArgs,
    payeeArg,
    payoutStakersCallArgs,
    setKeysCallArgs,
    validateCallArgs,
    WITHDRAW_UNBONDED_ARGS,
} from './calls/callArgs';
import {
    readAdmission,
    readBackers,
    readBlockedTargets,
    readEraPoints,
    readExposure,
    readFreeBalance,
    readMaxCommission,
    readMinBonds,
    readMinCommission,
    readNominationTargets,
    readNominationsQuota,
    readNonCandidates,
    readPendingRewards,
    readStakingAccount,
    readStakingConfig,
} from './storage/reads';
import type {
    Admission,
    AutoPayoutStatus,
    Backer,
    ExposureOverview,
    PendingPayout,
    RewardDestination,
    SessionKeysWithProof,
    StakingAccount,
    StakingConfig,
    ValidatorPrefs,
} from './types/index';

/** Concurrent `pending_rewards` calls while scanning eras. */
const PAYOUT_SCAN_CONCURRENCY = 8;

/**
 * Staking for validators and nominators: bonding, nominating, validating, payouts,
 * session keys and leaving the validator set.
 *
 * Calls go through PAPI's UnsafeApi with arguments by name, like
 * `ShieldedPoolModule`. Admission (`admission.ts`) tells a client why
 * `staking.validate` would be refused before it signs; the chain is the authority.
 * Controllers are deprecated: the signer is always the stash.
 */
export class StakingModule {
    constructor(private readonly substrate: SubstrateClient) {}

    // ─── Reads ─────────────────────────────────────────────────────────────────

    /** Ledger, payee, nominations, validator prefs and session keys of `stash`. */
    account(stash: string): Promise<StakingAccount> {
        return readStakingAccount(this.substrate, stash);
    }

    /** Active era and its start, minimum bonds, the commission floor and ceiling, and the era constants. */
    config(): Promise<StakingConfig> {
        return readStakingConfig(this.substrate);
    }

    /** Admission mode, and `stash`'s allowlist entry and ban. */
    admission(stash: string): Promise<Admission> {
        return readAdmission(this.substrate, stash);
    }

    eraPoints(era: number, stash: string): Promise<{ points: number; total: number }> {
        return readEraPoints(this.substrate, era, stash);
    }

    /** `stash`'s exposure in `era`, or null when it was not elected. */
    exposure(era: number, stash: string): Promise<ExposureOverview | null> {
        return readExposure(this.substrate, era, stash);
    }

    /** The nominators backing `validator` in `era`, from its exposure pages. */
    async nominatorsOf(era: number, validator: string): Promise<Backer[]> {
        const overview = await this.exposure(era, validator);
        return overview ? readBackers(this.substrate, era, validator, overview.pageCount) : [];
    }

    nominationsQuota(balance: bigint): Promise<number> {
        return readNominationsQuota(this.substrate, balance);
    }

    /** What the chain is paying on its own each era (`pallet-auto-payout`). See `paidAutomatically`. */
    autoPayout(): Promise<AutoPayoutStatus> {
        return readAutoPayout(this.substrate);
    }

    /**
     * The eras in `eras` where each validator in `validators` still has an
     * unclaimed reward page.
     *
     * ponytail: one runtime call per (validator, era), up to `historyDepth` eras ×
     * 16 targets; index claimed payouts if that gets slow.
     */
    async pendingPayouts(validators: string[], eras: number[]): Promise<PendingPayout[]> {
        const pairs = validators.flatMap((validator) => eras.map((era) => ({ validator, era })));
        const pending: PendingPayout[] = [];
        for (let i = 0; i < pairs.length; i += PAYOUT_SCAN_CONCURRENCY) {
            const batch = pairs.slice(i, i + PAYOUT_SCAN_CONCURRENCY);
            const flags = await Promise.all(
                batch.map((p) => readPendingRewards(this.substrate, p.era, p.validator))
            );
            batch.forEach((p, j) => flags[j] && pending.push(p));
        }
        return pending;
    }

    // ─── Bonding ───────────────────────────────────────────────────────────────

    /**
     * `staking.bond`: locks `value` from the signer's free balance; it becomes the stash.
     * Staking locks at most the free balance left after the fee. Refused before signing
     * when the signer is in a pool (the chain keeps the two apart, `Restricted`), when
     * `value` is below both role minimums (`InsufficientBond`), both after the fee, or
     * when what the chain would lock is: a stash bonded below every role.
     */
    bond(
        value: bigint,
        payee: RewardDestination,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ) {
        const tx = this.tx('Staking', 'bond', bondCallArgs(value, payee));
        return Promise.all([
            this.refuseIfPoolMember(signer),
            this.refuseBelowBondFloor(value, 0n, 'bond.value'),
            this.lockable(value, tx, signer).then((locked) =>
                this.refuseBelowBondFloor(locked, 0n, 'bond.value (after the fee)')
            ),
        ]).then(() => signAndSubmitTx(tx, signer, options));
    }

    /**
     * Bonds up to `value` more of the free balance (staking takes at most what the fee
     * leaves). Refused before signing when the bond would still be below both role
     * minimums (`InsufficientBond`, after the fee), e.g. after unbonding everything.
     */
    bondExtra(value: bigint, signer: SubstrateSigner, options?: SubmitOptions) {
        const tx = this.tx('Staking', 'bond_extra', bondExtraCallArgs(value));
        return this.activeOf(signer)
            .then(async (active) => {
                if (active === null) return;
                const locked = await this.lockable(value, tx, signer);
                await this.refuseBelowBondFloor(locked, active, 'bond_extra.max_additional');
            })
            .then(() => signAndSubmitTx(tx, signer, options));
    }

    /**
     * Starts unlocking `value`; it is withdrawable `bondingDuration` eras later. Unbonding
     * everything also chills the stash (it stops nominating or validating). Refused before
     * signing when it would leave a nominator or validator bonded below its role's minimum
     * (`InsufficientBond`, after the fee): unbond everything, or chill first.
     */
    unbond(value: bigint, signer: SubstrateSigner, options?: SubmitOptions) {
        const args = amountCallArgs(value, 'unbond');
        return this.refuseUnbondBelowRole(value, signer).then(() =>
            this.submit('Staking', 'unbond', args, signer, options)
        );
    }

    /**
     * Bonds again up to `value` of the funds still unlocking. Refused before signing when
     * the bond would still be below both role minimums (`InsufficientBond`, after the fee).
     */
    rebond(value: bigint, signer: SubstrateSigner, options?: SubmitOptions) {
        const args = amountCallArgs(value, 'rebond');
        const who = signerAccount(signer);
        const check = who
            ? readStakingAccount(this.substrate, who).then(({ ledger }) => {
                  if (!ledger) return;
                  const unlocking = ledger.unlocking.reduce((sum, c) => sum + c.value, 0n);
                  const back = value < unlocking ? value : unlocking;
                  return this.refuseBelowBondFloor(back, ledger.active, 'rebond.value');
              })
            : Promise.resolve();
        return check.then(() => this.submit('Staking', 'rebond', args, signer, options));
    }

    /** Frees the chunks whose unbonding era has come. */
    withdrawUnbonded(signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('Staking', 'withdraw_unbonded', WITHDRAW_UNBONDED_ARGS, signer, options);
    }

    setPayee(payee: RewardDestination, signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('Staking', 'set_payee', { payee: payeeArg(payee) }, signer, options);
    }

    // ─── Roles ─────────────────────────────────────────────────────────────────

    /**
     * Nominates `targets`, replacing the current list. Refused before signing when a new
     * target is not a validator candidate or blocks new nominations (`BadTarget`, after
     * the fee). A current target is kept whatever it is now, as the chain keeps it.
     */
    async nominate(targets: string[], signer: SubstrateSigner, options?: SubmitOptions) {
        const args = nominateCallArgs(targets);
        const who = signerAccount(signer);
        const [missing, blocked, current] = await Promise.all([
            readNonCandidates(this.substrate, args.targets),
            readBlockedTargets(this.substrate, args.targets),
            who ? readNominationTargets(this.substrate, who) : ([] as string[]),
        ]);
        const notValidating = missing.filter((t) => !current.includes(t));
        if (notValidating.length) {
            throw new Error(`nominate.targets: not a validator: ${notValidating.join(', ')}`);
        }
        const refused = blocked.filter((t) => !current.includes(t));
        if (refused.length) {
            throw new Error(`nominate.targets: blocks new nominations: ${refused.join(', ')}`);
        }
        return this.submit('Staking', 'nominate', args, signer, options);
    }

    /**
     * Offers to validate. Refused before signing when the commission is above the
     * on-chain ceiling (`MaxCommission`), and before any fee when admission fails
     * (`candidacyRejection`).
     */
    async validate(prefs: ValidatorPrefs, signer: SubstrateSigner, options?: SubmitOptions) {
        const args = validateCallArgs(prefs);
        const [min, max] = await Promise.all([
            readMinCommission(this.substrate),
            readMaxCommission(this.substrate),
        ]);
        if (args.prefs.commission > max) {
            throw new Error(`validate.commission: above the ${formatPercent(max)} maximum`);
        }
        if (args.prefs.commission < min) {
            throw new Error(`validate.commission: below the ${formatPercent(min)} minimum`);
        }
        return this.submit('Staking', 'validate', args, signer, options);
    }

    /** Stops nominating or validating from the next era; the bond stays. */
    chill(signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('Staking', 'chill', {}, signer, options);
    }

    /**
     * Removes nominators from the signer's validator (they must nominate again). Refused
     * before signing when one has a single target: the chain's call filter refuses a kick
     * that would leave a nomination empty, after the fee.
     */
    kick(nominators: string[], signer: SubstrateSigner, options?: SubmitOptions) {
        const args = kickCallArgs(nominators);
        return this.refuseLoneTargets(nominators).then(() =>
            this.submit('Staking', 'kick', args, signer, options)
        );
    }

    /** Pays `validator` and its nominators for `era`. Anyone may call it. */
    payoutStakers(
        validator: string,
        era: number,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ) {
        const args = payoutStakersCallArgs(validator, era);
        return this.submit('Staking', 'payout_stakers', args, signer, options);
    }

    // ─── Session keys and the validator set ────────────────────────────────────

    /** `session.setKeys` with keys and proof from `OperatorNode.rotateKeysWithOwner`. */
    setKeys(keys: SessionKeysWithProof, signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('Session', 'set_keys', setKeysCallArgs(keys), signer, options);
    }

    purgeKeys(signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('Session', 'purge_keys', {}, signer, options);
    }

    /** Leaves the validator allowlist (`validatorSet.deregisterValidator`); staking chills it. */
    deregisterValidator(signer: SubstrateSigner, options?: SubmitOptions) {
        return this.submit('ValidatorSet', 'deregister_validator', {}, signer, options);
    }

    private async refuseIfPoolMember(signer: SubstrateSigner): Promise<void> {
        const who = signerAccount(signer);
        if (who && (await readIsPoolMember(this.substrate, who))) {
            throw new Error('bond: the account is in a nomination pool; leave it first');
        }
    }

    /**
     * Refuses `active + added` below the lower role minimum (`min_chilled_bond`; the
     * deposit is 0), which `bond`, `bond_extra` and `rebond` require.
     */
    private async refuseBelowBondFloor(added: bigint, active: bigint, what: string): Promise<void> {
        const min = await readMinBonds(this.substrate);
        const floor = min.nominator < min.validator ? min.nominator : min.validator;
        if (active + added < floor) {
            throw new Error(`${what}: below the minimum bond of ${floor} planck`);
        }
    }

    /** What staking would lock of `value`: at most the signer's free balance after the fee. */
    private async lockable(value: bigint, tx: UnsafeTx, signer: SubstrateSigner): Promise<bigint> {
        const who = signerAccount(signer);
        if (!who) return value;
        const [free, fee] = await Promise.all([
            readFreeBalance(this.substrate, who),
            tx.getEstimatedFees?.(signer).catch(() => 0n) ?? Promise.resolve(0n),
        ]);
        const left = free > fee ? free - fee : 0n;
        return value < left ? value : left;
    }

    /** The signer's active bond, or null when it is not bonded or unknown. */
    private async activeOf(signer: SubstrateSigner): Promise<bigint | null> {
        const who = signerAccount(signer);
        if (!who) return null;
        return (await readStakingAccount(this.substrate, who)).ledger?.active ?? null;
    }

    private async refuseUnbondBelowRole(value: bigint, signer: SubstrateSigner): Promise<void> {
        const who = signerAccount(signer);
        if (!who) return;
        const [account, min] = await Promise.all([
            readStakingAccount(this.substrate, who),
            readMinBonds(this.substrate),
        ]);
        const active = account.ledger?.active;
        if (active === undefined || value >= active) return;
        const left = active - value;
        const role = account.nominations
            ? { name: 'nominator', min: min.nominator }
            : account.validatorPrefs
              ? { name: 'validator', min: min.validator }
              : null;
        if (role && left < role.min) {
            throw new Error(
                `unbond.value: would leave ${left} planck bonded, below the ${role.name} ` +
                    `minimum of ${role.min}; unbond everything (it stops staking) or chill first`
            );
        }
    }

    private async refuseLoneTargets(nominators: string[]): Promise<void> {
        const targets = await Promise.all(
            nominators.map((n) => readNominationTargets(this.substrate, n))
        );
        const alone = nominators.filter((_, i) => targets[i]!.length === 1);
        if (alone.length) {
            throw new Error(`kick.who: their only target would be removed: ${alone.join(', ')}`);
        }
    }

    private tx(pallet: string, call: string, args: Record<string, unknown>): UnsafeTx {
        return callUnsafeTx(resolveTx(this.substrate.unsafe, pallet, call), args);
    }

    private submit(
        pallet: string,
        call: string,
        args: Record<string, unknown>,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ): Promise<TxResult> {
        return signAndSubmitTx(this.tx(pallet, call, args), signer, options);
    }
}
