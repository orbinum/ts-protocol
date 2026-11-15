/**
 * What an exit is paid and whether the chain admits it, as `staking::private`'s
 * `check_redeem` decides, so a wallet refuses an exit before building its proof.
 */
import { privateShareValue } from './pricing';
import type { PrivateExitRefusal, PrivateExitState, PrivatePoolQuote } from './types';

/**
 * What an exit of `shares` paying `fee` shares is worth now, rounded down: an exit
 * leaving only its own fee's shares takes everything but what the fee is worth.
 */
export function privateExitValue(quote: PrivatePoolQuote, shares: bigint, fee: bigint): bigint {
    if (!quote.windDown && shares + fee === quote.supply) {
        const feeWorth = privateShareValue(quote, fee);
        return quote.netValue > feeWorth ? quote.netValue - feeWorth : 0n;
    }
    return privateShareValue(quote, shares);
}

/**
 * Why the chain would refuse an exit of `shares` paying `fee` shares with `minValue`, or
 * null. The membership keeps the pool's join minimum (unless what else is left is dust),
 * a nominating pool keeps its stake at the nominator minimum, and the member's unbonding
 * chunks stay within `MaxUnbonding`. The paid value ignores pool-point rounding (at most
 * a few planck): leave that margin in `minValue`.
 */
export function privateExitRefusal(
    state: PrivateExitState,
    shares: bigint,
    fee: bigint,
    minValue: bigint
): PrivateExitRefusal | null {
    const { quote } = state;
    if (shares <= 0n || fee < 0n) return 'NothingToRedeem';
    if (shares + fee > quote.supply) return 'SharesExceedSupply';
    const value = privateExitValue(quote, shares, fee);
    if (value <= 0n) return 'NothingToRedeem';
    if (quote.windDown) return value < minValue ? 'BelowMinimumOutput' : null;

    const left = state.memberValue > value ? state.memberValue - value : 0n;
    const others = privateShareValue(quote, quote.supply - shares - fee);
    const sweep =
        left > 0n &&
        left < state.minJoinBond &&
        state.pendingEntryPoints === 0n &&
        others < state.minSpendFee;
    if (left > 0n && left < state.minJoinBond && !sweep) return 'RemainderBelowMinimum';

    const released = sweep ? quote.netValue : value;
    const stakeLeft = state.poolStake > released ? state.poolStake - released : 0n;
    if (state.nominating && stakeLeft > 0n && stakeLeft < state.minNominatorBond) {
        return 'RemainderBelowMinimum';
    }
    if (
        !state.unbondingEras.includes(state.unlockEra) &&
        state.unbondingEras.length >= state.maxUnbonding
    ) {
        return 'TooManyUnbonding';
    }
    const paid = sweep || released < value ? released : value;
    return paid < minValue ? 'BelowMinimumOutput' : null;
}
