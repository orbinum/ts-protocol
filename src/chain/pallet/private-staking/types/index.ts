/** A destroying pool's shares, fixed in value once its private member has unbonded. */
export type PrivateWindDown = {
    /** What the shares left are worth, in planck. */
    value: bigint;
    /** The part of `value` already liquid in the private member's account. */
    liquid: bigint;
    /** When the unbonded rest unlocks. */
    unlockEra: number;
    /** Whether the rest was withdrawn (`value` is then all liquid). */
    withdrawn: boolean;
};

/** A nomination pool's private side (`PrivateStaking.Pools`). */
export type PrivatePool = {
    poolId: number;
    /** The pool's share asset (`sN`) in the shielded pool. */
    assetId: number;
    /** Whether new private entries are taken. Exits never close. */
    enabled: boolean;
    /** Shares in existence, notes and unredeemed fees. */
    supply: bigint;
    /** The last era whose rewards were compounded, or null before the first. */
    compoundedEra: number | null;
    windDown: PrivateWindDown | null;
};

/**
 * What prices a pool's shares now: `value = shares·(owned + V) / (supply + V)`, never above
 * pro rata, the last shares taking everything left, where `owned = netValue + uncompounded`
 * is what the minted shares own, as the runtime rounds it.
 */
export type PrivatePoolQuote = {
    poolId: number;
    assetId: number;
    supply: bigint;
    /** What the minted shares' points are worth: the private member's points less pending entries'. */
    netValue: bigint;
    /**
     * The private member's rewards not compounded yet: pending in the pool, or paid to its
     * free balance (less its existential deposit and what it holds for outputs and entries).
     * They belong to the minted shares.
     */
    uncompounded: bigint;
    /** The runtime's virtual offset `V` (`PrivateStaking.VirtualOffset`). */
    virtualOffset: bigint;
    windDown: PrivateWindDown | null;
};

/** Why an entry would be refused, before any proof is built. */
export type PrivateEntryRefusal =
    | 'NotPrivate'
    | 'PoolNotOpen'
    | 'BelowMinimum'
    | 'NoSuchPool'
    | 'PoolSlashed'
    | 'TooManyMembers'
    /** This era's entries into the pool are full: it takes entries again next era. */
    | 'QueueFull';

/** Why an exit would be refused, before any proof is built (`privateExitRefusal`). */
export type PrivateExitRefusal =
    | 'NoSuchPool'
    | 'NothingToRedeem'
    | 'SharesExceedSupply'
    | 'RemainderBelowMinimum'
    | 'TooManyUnbonding'
    | 'BelowMinimumOutput';

/** What decides whether an exit is admitted, read at one block. */
export type PrivateExitState = {
    quote: PrivatePoolQuote;
    /** What all the private member's points are worth, pending entries' included. */
    memberValue: bigint;
    /** Points of entries not minted yet. */
    pendingEntryPoints: bigint;
    /** The pool's whole bond, in planck. */
    poolStake: bigint;
    /** Whether the pool nominates: its bond then stays at `minNominatorBond`. */
    nominating: boolean;
    minJoinBond: bigint;
    minNominatorBond: bigint;
    /** The shielded pool's `MinSpendFee`: shares worth less are dust. */
    minSpendFee: bigint;
    /** Eras the private member has unbonding chunks for. */
    unbondingEras: number[];
    /** `NominationPools.MaxUnbonding`. */
    maxUnbonding: number;
    /** The era an exit now unlocks in: the active era plus the nominator unbonding. */
    unlockEra: number;
};
