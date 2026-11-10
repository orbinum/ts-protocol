/**
 * Who may validate, as the runtime decides it (`staking/admission.rs`,
 * `staking/candidacy.rs`), so a client can say why before anyone signs.
 *
 * `staking.validate` is refused before it costs a fee when the account fails a
 * condition, with `InvalidTransaction::Custom(code)`, and so is a session key change
 * by a validator whose keys are in use (8). The codes are stable.
 */
import { OPEN_MODE_MIN_SELF_BOND } from './constants';
import type { Admission, StakingAccount, StakingConfig } from './types/index';

/** `Inadmissible`, by the code the runtime rejects `staking.validate` with. */
export const CANDIDACY_REJECTIONS = {
    1: 'NotApproved',
    2: 'Banned',
    3: 'NoSessionKeys',
    4: 'InsufficientSelfBond',
    5: 'CommissionTooHigh',
    6: 'NotBonded',
    /** The candidate list is full (`MaxTargets`); the account is not in it. */
    7: 'TooManyCandidates',
    /**
     * `session.setKeys` / `purgeKeys` from a validator of the current or queued session:
     * its keys are in use until it leaves the set.
     */
    8: 'SessionKeysInUse',
} as const;

export type CandidacyRejection = (typeof CANDIDACY_REJECTIONS)[keyof typeof CANDIDACY_REJECTIONS];

/**
 * The self-bond a candidate needs: `MinValidatorBond`, never below the open floor while
 * open. Pass `admission.openFloor`; the default is the production floor.
 */
export function minSelfBond(
    mode: Admission['mode'],
    minValidatorBond: bigint,
    openFloor: bigint = OPEN_MODE_MIN_SELF_BOND
): bigint {
    return mode === 'Open' && minValidatorBond < openFloor ? openFloor : minValidatorBond;
}

/**
 * The first era a nomination or bond change made now can count in: the era after the
 * latest planned one (`plannedEra + 1`; one era later than `activeEra + 1` once the next
 * election started, whose snapshot it may miss). Null before staking has an era. A
 * commission change can land one era earlier: staking reads it when it fetches the
 * election's result, not in the snapshot.
 */
export function changesApplyFrom(
    config: Pick<StakingConfig, 'activeEra' | 'plannedEra'>
): number | null {
    const latest = config.plannedEra ?? config.activeEra;
    return latest === null ? null : latest + 1;
}

/**
 * The eras whose rewards `payoutStakers` can still pay: from the oldest staking keeps
 * (`plannedEra - historyDepth`) to the last closed one (`activeEra - 1`). Null before
 * an era closed.
 */
export function claimableEras(
    config: Pick<StakingConfig, 'activeEra' | 'plannedEra' | 'historyDepth'>
): { from: number; to: number } | null {
    const { activeEra, historyDepth } = config;
    if (activeEra === null || activeEra === 0) return null;
    const planned = config.plannedEra ?? activeEra;
    return { from: Math.max(0, planned - historyDepth), to: activeEra - 1 };
}

/** Whether a ban is in force at the current block. */
export function isBanned(admission: Admission): boolean {
    const { ban, now } = admission;
    return ban === 'permanent' || (ban !== null && now < ban.until);
}

/** One condition of the rule, met or not. */
export interface CandidacyCheck {
    reason: CandidacyRejection;
    ok: boolean;
}

/**
 * Every condition for `validate({ commission })`, in the order the runtime checks
 * them; the first that fails is the code it rejects with. `NotApproved` passes
 * while admission is open. `TooManyCandidates` depends on the candidate list, not the
 * account, so it is not listed: the runtime checks it last.
 */
export function candidacyChecklist(
    account: StakingAccount,
    admission: Admission,
    config: Pick<StakingConfig, 'minValidatorBond' | 'maxCommission'>,
    commission: number
): CandidacyCheck[] {
    const active = account.ledger?.active ?? 0n;
    return [
        { reason: 'NotBonded', ok: account.ledger !== null },
        { reason: 'Banned', ok: !isBanned(admission) },
        { reason: 'NotApproved', ok: admission.mode === 'Open' || admission.approved },
        { reason: 'NoSessionKeys', ok: account.sessionKeys !== null },
        {
            reason: 'InsufficientSelfBond',
            ok: active >= minSelfBond(admission.mode, config.minValidatorBond, admission.openFloor),
        },
        { reason: 'CommissionTooHigh', ok: commission <= config.maxCommission },
    ];
}

/** The first condition `candidacyChecklist` fails, or null when `validate` would pass. */
export function firstCandidacyFailure(checks: CandidacyCheck[]): CandidacyRejection | null {
    return checks.find((c) => !c.ok)?.reason ?? null;
}

/**
 * The reason inside a `staking.validate` rejection, or null. Reads the code from
 * PAPI's `{ type: 'Invalid', value: { type: 'Custom', value: n } }` and from a
 * message's `Custom(n)` / `Custom error: n`.
 */
export function candidacyRejection(error: unknown): CandidacyRejection | null {
    const code = customCode(error);
    return code !== null && code in CANDIDACY_REJECTIONS
        ? CANDIDACY_REJECTIONS[code as keyof typeof CANDIDACY_REJECTIONS]
        : null;
}

function customCode(error: unknown): number | null {
    const seen = new Set<unknown>();
    const walk = (v: unknown): number | null => {
        if (!v || typeof v !== 'object' || seen.has(v)) return null;
        seen.add(v);
        const o = v as { type?: unknown; value?: unknown } & Record<string, unknown>;
        if (o.type === 'Custom' && typeof o.value === 'number') return o.value;
        for (const key of ['error', 'value', 'cause']) {
            const found = walk(o[key]);
            if (found !== null) return found;
        }
        return null;
    };
    const structured = walk(error);
    if (structured !== null) return structured;
    const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    const match = text.match(/Custom(?: error:|\(|"?,"value":)\s*(\d+)/);
    return match ? Number(match[1]) : null;
}
