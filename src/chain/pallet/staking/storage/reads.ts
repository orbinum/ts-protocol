/**
 * `Staking`, `Session` and `ValidatorSet` storage, constants and the `StakingApi`
 * runtime API, read through PAPI's UnsafeApi.
 *
 * The UnsafeApi is untyped; `StakingReads` is the slice of it these reads use, so a
 * renamed item fails here rather than at every call site.
 */
import type { SubstrateClient } from '../../../substrate/SubstrateClient';
import { accountIdHexToSs58, addressToAccountIdHex } from '../../../../foundation/address';
import { fromHex, toHex } from '../../../../foundation/encoding/hex';
import { openModeMinSelfBond } from '../constants';
import type {
    Admission,
    Backer,
    ExposureOverview,
    RewardDestination,
    StakingAccount,
    StakingConfig,
} from '../types/index';

/** PAPI binary values: `0x` hex, or an object that renders as one. */
type Bin = string | { asHex(): string };
type Enum<T extends string, V = undefined> = { type: T; value: V };
type Num = bigint | number | string;
/**
 * State the user's own transactions change is read at the best block: a
 * transaction resolved there (`resolveAt: 'best'`) shows at once, not one
 * finality lag later.
 */
type At = { at: 'best' };
const BEST: At = { at: 'best' };

/** The slice of PAPI's UnsafeApi the staking reads use. */
type StakingReads = {
    query: {
        Staking: {
            Ledger: {
                getValue(
                    stash: string,
                    at?: At
                ): Promise<
                    | { total: Num; active: Num; unlocking: { value: Num; era: number }[] }
                    | undefined
                >;
            };
            Payee: {
                getValue(
                    stash: string,
                    at?: At
                ): Promise<
                    | Enum<
                          'Staked' | 'Stash' | 'Controller' | 'Account' | 'None',
                          string | undefined
                      >
                    | undefined
                >;
            };
            Nominators: {
                getValue(
                    stash: string,
                    at?: At
                ): Promise<{ targets: string[]; submitted_in: number } | undefined>;
            };
            Validators: {
                getValue(stash: string, at?: At): Promise<{ commission: number; blocked: boolean }>;
            };
            ActiveEra: { getValue(): Promise<{ index: number; start?: Num } | undefined> };
            CurrentEra: { getValue(): Promise<number | undefined> };
            MinNominatorBond: { getValue(at?: At): Promise<Num> };
            MinValidatorBond: { getValue(at?: At): Promise<Num> };
            MinCommission: { getValue(): Promise<number> };
            MaxCommission: { getValue(at?: At): Promise<number> };
            ErasRewardPoints: {
                getValue(era: number): Promise<{ total: number; individual: [string, number][] }>;
            };
            ErasStakersOverview: {
                getValue(
                    era: number,
                    stash: string
                ): Promise<
                    | { total: Num; own: Num; nominator_count: number; page_count: number }
                    | undefined
                >;
            };
            ErasStakersPaged: {
                getValue(
                    era: number,
                    stash: string,
                    page: number
                ): Promise<{ others: { who: string; value: Num }[] } | undefined>;
            };
        };
        Session: {
            NextKeys: {
                getValue(stash: string, at?: At): Promise<{ aura: Bin; grandpa: Bin } | undefined>;
            };
        };
        ValidatorSet: {
            Mode: { getValue(at?: At): Promise<Enum<'Permissioned' | 'Open'>> };
            ApprovedValidators: { getValue(at?: At): Promise<string[]> };
            Bans: {
                getValue(
                    who: string,
                    at?: At
                ): Promise<Enum<'Until', number> | Enum<'Permanent'> | undefined>;
            };
        };
        System: {
            Number: { getValue(at?: At): Promise<number> };
            Account: { getValue(who: string, at?: At): Promise<{ data: { free: Num } }> };
        };
    };
    constants: {
        System: { Version(): Promise<{ spec_name: string }> };
        Staking: {
            BondingDuration(): Promise<number>;
            HistoryDepth(): Promise<number>;
            SessionsPerEra(): Promise<number>;
        };
    };
    apis: {
        StakingApi: {
            pending_rewards(era: number, account: string, at?: At): Promise<boolean>;
            nominations_quota(balance: bigint): Promise<number>;
        };
    };
};

function reads(substrate: SubstrateClient): StakingReads {
    return substrate.unsafe as unknown as StakingReads;
}

/** `account` as SS58, or throws: the reads key by SS58. */
export function toSs58(account: string, where: string): string {
    const hex = addressToAccountIdHex(account);
    const ss58 = hex ? accountIdHexToSs58(hex) : null;
    if (!ss58) throw new Error(`${where}: not an account address: ${account}`);
    return ss58;
}

const hexOf = (b: Bin): string => (typeof b === 'string' ? b : b.asHex());

function rewardDestination(
    payee: Enum<'Staked' | 'Stash' | 'Controller' | 'Account' | 'None', string | undefined>
): RewardDestination {
    if (payee.type === 'Account') return { type: 'Account', account: String(payee.value) };
    // A legacy `Controller` payee pays the stash: the controller is the stash.
    if (payee.type === 'Controller') return { type: 'Stash' };
    return { type: payee.type };
}

/**
 * Whether `Staking.Validators` holds `stash`. The map's default value reads like
 * zero-commission prefs, so presence is checked on the raw key, at the best block
 * like the rest of the account.
 */
async function isValidator(substrate: SubstrateClient, stash: string): Promise<boolean> {
    const builder = await substrate.getDynamicBuilder();
    const key = builder.buildStorage('Staking', 'Validators').keys.enc(stash);
    return (await substrate.request<string | null>('state_getStorage', [key])) !== null;
}

/** The `targets` that are not validator candidates (`Staking.Validators`) at the best block. */
export async function readNonCandidates(
    substrate: SubstrateClient,
    targets: string[]
): Promise<string[]> {
    const found = await Promise.all(targets.map((t) => isValidator(substrate, t)));
    return targets.filter((_, i) => !found[i]);
}

/** `account`'s free balance at the best block: with no deposit, all staking can bond. */
export async function readFreeBalance(
    substrate: SubstrateClient,
    account: string
): Promise<bigint> {
    const who = toSs58(account, 'staking.freeBalance');
    const { data } = await reads(substrate).query.System.Account.getValue(who, BEST);
    return BigInt(data.free);
}

/** `MinNominatorBond` and `MinValidatorBond` at the best block. */
export async function readMinBonds(
    substrate: SubstrateClient
): Promise<{ nominator: bigint; validator: bigint }> {
    const { Staking } = reads(substrate).query;
    const [nominator, validator] = await Promise.all([
        Staking.MinNominatorBond.getValue(BEST),
        Staking.MinValidatorBond.getValue(BEST),
    ]);
    return { nominator: BigInt(nominator), validator: BigInt(validator) };
}

/** Whether `account` stakes directly (has a ledger) at the best block. */
export async function readIsStaker(substrate: SubstrateClient, account: string): Promise<boolean> {
    const stash = toSs58(account, 'staking.account');
    return (await reads(substrate).query.Staking.Ledger.getValue(stash, BEST)) !== undefined;
}

/** `account`'s current nomination targets at the best block; none when it does not nominate. */
export async function readNominationTargets(
    substrate: SubstrateClient,
    account: string
): Promise<string[]> {
    const who = toSs58(account, 'staking.account');
    return (await reads(substrate).query.Staking.Nominators.getValue(who, BEST))?.targets ?? [];
}

/** The `targets` whose validator blocks new nominations (`ValidatorPrefs.blocked`). */
export async function readBlockedTargets(
    substrate: SubstrateClient,
    targets: string[]
): Promise<string[]> {
    const { Validators } = reads(substrate).query.Staking;
    const prefs = await Promise.all(targets.map((t) => Validators.getValue(t, BEST)));
    return targets.filter((_, i) => prefs[i]?.blocked === true);
}

/** Staking's commission floor (`MinCommission`), in `Perbill` parts. */
export function readMinCommission(substrate: SubstrateClient): Promise<number> {
    return reads(substrate).query.Staking.MinCommission.getValue();
}

/** Ledger, payee, nominations, validator prefs and session keys of `stash`. */
export async function readStakingAccount(
    substrate: SubstrateClient,
    account: string
): Promise<StakingAccount> {
    const stash = toSs58(account, 'staking.account');
    const { Staking, Session } = reads(substrate).query;
    const [ledger, payee, nominations, validating, prefs, keys] = await Promise.all([
        Staking.Ledger.getValue(stash, BEST),
        Staking.Payee.getValue(stash, BEST),
        Staking.Nominators.getValue(stash, BEST),
        isValidator(substrate, stash),
        Staking.Validators.getValue(stash, BEST),
        Session.NextKeys.getValue(stash, BEST),
    ]);
    return {
        stash,
        ledger: ledger
            ? {
                  total: BigInt(ledger.total),
                  active: BigInt(ledger.active),
                  unlocking: ledger.unlocking.map((c) => ({ value: BigInt(c.value), era: c.era })),
              }
            : null,
        payee: payee ? rewardDestination(payee) : null,
        nominations: nominations
            ? { targets: nominations.targets, submittedIn: nominations.submitted_in }
            : null,
        validatorPrefs: validating
            ? { commission: prefs.commission, blocked: prefs.blocked }
            : null,
        // SessionKeys is `{ aura, grandpa }`; the registered blob is their concatenation.
        sessionKeys: keys
            ? toHex(
                  new Uint8Array([keys.aura, keys.grandpa].flatMap((k) => [...fromHex(hexOf(k))]))
              )
            : null,
    };
}

/** Staking's commission ceiling (`MaxCommission`) at the best block, in `Perbill` parts. */
export function readMaxCommission(substrate: SubstrateClient): Promise<number> {
    return reads(substrate).query.Staking.MaxCommission.getValue(BEST);
}

/** Era, minimum bonds, the commission floor and ceiling, and the era constants. */
export async function readStakingConfig(substrate: SubstrateClient): Promise<StakingConfig> {
    const { query, constants } = reads(substrate);
    const [
        era,
        planned,
        minNominatorBond,
        minValidatorBond,
        minCommission,
        maxCommission,
        bonding,
        history,
        sessions,
    ] = await Promise.all([
        query.Staking.ActiveEra.getValue(),
        query.Staking.CurrentEra.getValue(),
        query.Staking.MinNominatorBond.getValue(),
        query.Staking.MinValidatorBond.getValue(),
        query.Staking.MinCommission.getValue(),
        readMaxCommission(substrate),
        constants.Staking.BondingDuration(),
        constants.Staking.HistoryDepth(),
        constants.Staking.SessionsPerEra(),
    ]);
    return {
        activeEra: era ? era.index : null,
        activeEraStartMs: era?.start != null ? Number(era.start) : null,
        plannedEra: planned ?? null,
        minNominatorBond: BigInt(minNominatorBond),
        minValidatorBond: BigInt(minValidatorBond),
        minCommission,
        maxCommission,
        bondingDuration: bonding,
        historyDepth: history,
        sessionsPerEra: sessions,
    };
}

/** Admission mode, and `account`'s allowlist entry and ban. */
export async function readAdmission(
    substrate: SubstrateClient,
    account: string
): Promise<Admission> {
    const who = toSs58(account, 'staking.admission');
    const { query, constants } = reads(substrate);
    const { ValidatorSet, System } = query;
    const [mode, approved, ban, now, version] = await Promise.all([
        ValidatorSet.Mode.getValue(BEST),
        ValidatorSet.ApprovedValidators.getValue(BEST),
        ValidatorSet.Bans.getValue(who, BEST),
        System.Number.getValue(BEST),
        constants.System.Version(),
    ]);
    return {
        mode: mode.type,
        approved: approved.includes(who),
        ban: !ban ? null : ban.type === 'Permanent' ? 'permanent' : { until: Number(ban.value) },
        // A transaction is checked in the block after the best one.
        now: now + 1,
        openFloor: openModeMinSelfBond(version.spec_name),
    };
}

/** Era points `stash` earned in `era`, and the era's total. */
export async function readEraPoints(
    substrate: SubstrateClient,
    era: number,
    account: string
): Promise<{ points: number; total: number }> {
    const stash = toSs58(account, 'staking.eraPoints');
    const { total, individual } =
        await reads(substrate).query.Staking.ErasRewardPoints.getValue(era);
    return { points: individual.find(([who]) => who === stash)?.[1] ?? 0, total };
}

/** `stash`'s exposure in `era`, or null when it was not elected. */
export async function readExposure(
    substrate: SubstrateClient,
    era: number,
    account: string
): Promise<ExposureOverview | null> {
    const stash = toSs58(account, 'staking.exposure');
    const o = await reads(substrate).query.Staking.ErasStakersOverview.getValue(era, stash);
    return o
        ? {
              total: BigInt(o.total),
              own: BigInt(o.own),
              nominatorCount: o.nominator_count,
              pageCount: o.page_count,
          }
        : null;
}

/** The nominators backing `stash` in `era`, every exposure page. */
export async function readBackers(
    substrate: SubstrateClient,
    era: number,
    account: string,
    pageCount: number
): Promise<Backer[]> {
    const stash = toSs58(account, 'staking.backers');
    const { ErasStakersPaged } = reads(substrate).query.Staking;
    const pages = await Promise.all(
        Array.from({ length: pageCount }, (_, page) => ErasStakersPaged.getValue(era, stash, page))
    );
    return pages.flatMap((p) =>
        (p?.others ?? []).map((o) => ({ who: o.who, value: BigInt(o.value) }))
    );
}

/** Whether `validator` has an unclaimed reward page in `era` (`StakingApi.pending_rewards`). */
export function readPendingRewards(
    substrate: SubstrateClient,
    era: number,
    validator: string
): Promise<boolean> {
    return reads(substrate).apis.StakingApi.pending_rewards(
        era,
        toSs58(validator, 'staking.pendingRewards'),
        BEST
    );
}

/** How many validators a nominator bonding `balance` may back (`StakingApi.nominations_quota`). */
export async function readNominationsQuota(
    substrate: SubstrateClient,
    balance: bigint
): Promise<number> {
    return Number(await reads(substrate).apis.StakingApi.nominations_quota(balance));
}
