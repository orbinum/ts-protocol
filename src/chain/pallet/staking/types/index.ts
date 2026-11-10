/**
 * Staking state and call parameters as this SDK exposes them: amounts in planck
 * (`bigint`), accounts in SS58, commissions in `Perbill` parts (0..1e9).
 */

/** Where a staker's rewards go (`RewardDestination`; `Controller` is deprecated and refused). */
export type RewardDestination =
    | { type: 'Staked' }
    | { type: 'Stash' }
    | { type: 'Account'; account: string }
    | { type: 'None' };

/** Funds unbonding until `era`, when `withdrawUnbonded` frees them. */
export interface UnlockChunk {
    value: bigint;
    era: number;
}

/** A validator's preferences: commission in `Perbill` parts, and whether it refuses new nominations. */
export interface ValidatorPrefs {
    commission: number;
    blocked: boolean;
}

/** One account's staking state, read in one go. `ledger` is null when it never bonded. */
export interface StakingAccount {
    stash: string;
    ledger: { total: bigint; active: bigint; unlocking: UnlockChunk[] } | null;
    payee: RewardDestination | null;
    /** Set while the account nominates. */
    nominations: { targets: string[]; submittedIn: number } | null;
    /** Set while the account offers to validate (`staking.validate`). */
    validatorPrefs: ValidatorPrefs | null;
    /** Session keys as `0x` hex (aura ++ grandpa), or null when none are registered. */
    sessionKeys: string | null;
}

/** Chain-wide staking parameters. */
export interface StakingConfig {
    activeEra: number | null;
    /** Active era's start, unix ms; null until the era's first block sets it. */
    activeEraStartMs: number | null;
    /**
     * `CurrentEra`: the latest era staking planned. Ahead of `activeEra` once the next
     * era's election started, whose snapshot a change may already miss.
     */
    plannedEra: number | null;
    minNominatorBond: bigint;
    minValidatorBond: bigint;
    minCommission: number;
    /** `MaxCommission`, set by governance; `PERBILL` (100 %) when there is no ceiling. */
    maxCommission: number;
    bondingDuration: number;
    historyDepth: number;
    sessionsPerEra: number;
}

/** Who `pallet-validator-set` lets validate: the mode, and this account's allowlist entry and ban. */
export interface Admission {
    mode: 'Permissioned' | 'Open';
    approved: boolean;
    /** Ban end block, `'permanent'`, or null; an ending block in the past means no ban. */
    ban: { until: number } | 'permanent' | null;
    /** The block a transaction sent now is checked in (best + 1), against which `ban.until` is read. */
    now: number;
    /** The runtime's self-bond floor while admission is open (`openModeMinSelfBond`). */
    openFloor: bigint;
}

/** A validator's exposure in an era: total and own stake, and how many nominators back it. */
export interface ExposureOverview {
    total: bigint;
    own: bigint;
    nominatorCount: number;
    pageCount: number;
}

/** A nominator's share in a validator's exposure. */
export interface Backer {
    who: string;
    value: bigint;
}

/** Automatic reward payment, as `StakingModule.autoPayout` reads it. */
export interface AutoPayoutStatus {
    /** Governance paused it: rewards must be claimed by hand meanwhile. */
    paused: boolean;
    /** Closed eras waiting to be paid, oldest first. */
    queued: number[];
    /**
     * Older eras are within `ExpiryMargin` eras of leaving staking's history: the chain
     * may drop them unpaid (`EraExpired`), so their rewards are best claimed by hand.
     */
    safeFrom: number;
    /**
     * The era being paid and its progress, in pages: its validators in payment
     * order, and the next page to pay (`validators[validator]`, page `page`).
     */
    paying: {
        era: number;
        pages: number;
        pagesDone: number;
        validators: string[];
        next: { validator: number; page: number };
    } | null;
}

/** An era whose reward a validator (and its nominators) can still claim. */
export interface PendingPayout {
    validator: string;
    era: number;
}

/** Keys and their ownership proof, as `author_rotateKeysWithOwner` returns them. */
export interface SessionKeysWithProof {
    keys: string;
    proof: string;
}
