import type { HexString } from '../values/hex-string';
import type { PlanckString } from '../values/planck-string';

/** One EVM call a private call makes, from the shared executor. */
export interface OrbinumPrivateCallStep {
    /** The contract called. */
    target: HexString;
    /** Its calldata. */
    input: HexString;
    /** ORB sent with the call. */
    value: PlanckString;
}

/**
 * `orbinum_privateCall`: contract calls paid from the account's shielded balance,
 * which no one can tie to the account.
 *
 * The wallet spends a note of `amount` to the executor, which makes each step in
 * order; whatever the executor holds afterwards comes back to the wallet as a new
 * private note. If a step fails, or less than `minReturn` comes back, every step is
 * undone and `amount` comes back — but the fee is paid either way, so the wallet
 * simulates the steps before the user approves.
 *
 * The wallet chooses the note, the gas, the fee and the deadline.
 */
export interface OrbinumPrivateCallParams {
    /** 1 to 8 steps (`PRIVATE_CALL_MAX_STEPS`), each with at most 16 KiB of calldata. */
    steps: OrbinumPrivateCallStep[];
    /** What the executor receives; at least the steps' values combined. */
    amount: PlanckString;
    /** The least that must come back for the call to stand. */
    minReturn: PlanckString;
}
