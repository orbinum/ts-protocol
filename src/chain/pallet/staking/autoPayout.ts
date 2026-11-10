/**
 * Automatic reward payment (`pallet-auto-payout`): which eras the chain is paying
 * on its own, and which ones a staker has to claim by hand.
 */
import type { SubstrateClient } from '../../substrate/SubstrateClient';
import type { AutoPayoutStatus } from './types/index';
import { toSs58 } from './storage/reads';

type CurrentEra = {
    era: number;
    validators: { stash: string; pages: number }[];
    validator: number;
    page: number;
};

type AutoPayoutReads = {
    query: {
        AutoPayout: {
            Paused: { getValue(): Promise<boolean> };
            Queue: { getValue(): Promise<number[]> };
            Current: { getValue(): Promise<CurrentEra | undefined> };
        };
        Staking: { CurrentEra: { getValue(): Promise<number | undefined> } };
    };
    constants: {
        AutoPayout: { ExpiryMargin(): Promise<number> };
        Staking: { HistoryDepth(): Promise<number> };
    };
};

/** Pages paid so far of the era being paid: whole validators before the cursor, then its page. */
function pagesDone(current: CurrentEra): number {
    const before = current.validators
        .slice(0, current.validator)
        .reduce((sum, v) => sum + v.pages, 0);
    return before + current.page;
}

/** What the chain is paying on its own: the era being paid, the queued ones, and the pause. */
export async function readAutoPayout(substrate: SubstrateClient): Promise<AutoPayoutStatus> {
    const { query, constants } = substrate.unsafe as unknown as AutoPayoutReads;
    const { AutoPayout } = query;
    const [paused, queued, current, planned, depth, margin] = await Promise.all([
        AutoPayout.Paused.getValue(),
        AutoPayout.Queue.getValue(),
        AutoPayout.Current.getValue(),
        query.Staking.CurrentEra.getValue(),
        constants.Staking.HistoryDepth(),
        constants.AutoPayout.ExpiryMargin(),
    ]);
    return {
        paused,
        queued: [...queued],
        safeFrom: planned === undefined ? 0 : Math.max(0, planned - depth) + margin,
        paying: current
            ? {
                  era: current.era,
                  pages: current.validators.reduce((sum, v) => sum + v.pages, 0),
                  pagesDone: pagesDone(current),
                  validators: current.validators.map((v) => v.stash),
                  next: { validator: current.validator, page: current.page },
              }
            : null,
    };
}

/**
 * Whether the chain will pay `validator`'s pending reward of `era` on its own:
 * automatic payment is on, the era is not within `ExpiryMargin` eras of leaving
 * staking's history (`safeFrom`), and it is queued, or being paid and the cursor has
 * not passed the validator yet. A validator the cursor passed with a reward still
 * pending was skipped (staking refused a page), and needs a claim, as does an era
 * neither queued nor being paid. Without `validator`, answers for the era.
 */
export function paidAutomatically(
    era: number,
    status: AutoPayoutStatus,
    validator?: string
): boolean {
    // Close to leaving staking's history: the chain may drop it before reaching it.
    if (status.paused || era < status.safeFrom) return false;
    if (status.queued.includes(era)) return true;
    const paying = status.paying;
    if (paying?.era !== era) return false;
    if (validator === undefined) return true;
    const at = paying.validators.indexOf(toSs58(validator, 'paidAutomatically'));
    return at >= paying.next.validator;
}
