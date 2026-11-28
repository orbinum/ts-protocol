import type { HexString } from '../values/hex-string';
import type { PlanckString } from '../values/planck-string';

/** A private call, landed: the chain's `PrivateCall.Executed` outcome. */
export interface OrbinumPrivateCallReceipt {
    txHash: HexString;
    /** Whether every step ran and at least `minReturn` came back. */
    success: boolean;
    /** Gas the steps used, decimal. The fee covered the whole gas limit regardless. */
    gasUsed: string;
    /** What came back to the wallet as a private note: the calls' return, or `amount` on failure. */
    returned: PlanckString;
}
