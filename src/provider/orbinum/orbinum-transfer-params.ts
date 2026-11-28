import type { PlanckString } from '../values/planck-string';

/** `orbinum_transfer`: a public ORB payment from the connected substrate account. */
export interface OrbinumTransferParams {
    /** An SS58 account, or a 0x EVM address (paid to its mapped account). */
    to: string;
    /** More than zero. */
    value: PlanckString;
}
