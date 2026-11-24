/**
 * What an exit is paid and whether the chain admits it, as `staking::private`'s
 * `check_redeem` decides, so a wallet refuses an exit before building its proof.
 */
import { privateOwnedValue, privatePartOf, privateShareValue } from './pricing';
import type { PrivateExitRefusal, PrivateExitState, PrivatePoolQuote } from './types';

/**
 * The bonded part of an exit of `shares` paying `fee` shares, and its whole value (the
 * bonded part plus its part of the rewards not compounded yet). An exit leaving only its
 * own fee's shares takes everything but what the fee is worth.
 */
function exitParts(
    quote: PrivatePoolQuote,
    shares: bigint,
    fee: bigint
): { bonded: bigint; whole: bigint } {
    const net = quote.netValue;
    const owned = privateOwnedValue(quote);
    if (shares + fee === quote.supply) {
        const less = (total: bigint) => {
            const feeWorth = privatePartOf(quote, fee, total);
            return total > feeWorth ? total - feeWorth : 0n;
        };
        return { bonded: less(net), whole: less(owned) };
    }
    return {
        bonded: privatePartOf(quote, shares, net),
        whole: privatePartOf(quote, shares, owned),
    };
}

/**
 * What an exit of `shares` paying `fee` shares is worth now, rounded down: its bonded part
 * and its part of the rewards not compounded yet.
 */
export function privateExitValue(quote: PrivatePoolQuote, shares: bigint, fee: bigint): bigint {
    if (quote.windDown) return privateShareValue(quote, shares);
    return exitParts(quote, shares, fee).whole;
}

/**
 * Why the chain would refuse an exit of `shares` paying `fee` shares with `minValue`, or
 * null. The membership keeps the pool's join minimum (unless what else is left is dust),
 * a nominating pool keeps its stake at the nominator minimum, and the member's unbonding
 * chunks stay within `MaxUnbonding`; these rules apply to the exit's bonded part, its part
 * of the rewards being paid from the member's free balance. The paid value ignores
 * pool-point rounding (at most a few planck): leave that margin in `minValue`.
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
    if (quote.windDown) {
        const value = privateShareValue(quote, shares);
        if (value <= 0n) return 'NothingToRedeem';
        return value < minValue ? 'BelowMinimumOutput' : null;
    }
    const { bonded: value, whole } = exitParts(quote, shares, fee);
    if (value <= 0n) return 'NothingToRedeem';

    const owned = privateOwnedValue(quote);
    const left = state.memberValue > value ? state.memberValue - value : 0n;
    const others = privatePartOf(quote, quote.supply - shares - fee, owned);
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
    // Taking every minted point, the exit takes every reward too.
    const takesAll = released >= quote.netValue && state.pendingEntryPoints === 0n;
    const rewards = takesAll ? quote.uncompounded : whole - value;
    const paid = (sweep || released < value ? released : value) + rewards;
    return paid < minValue ? 'BelowMinimumOutput' : null;
}
