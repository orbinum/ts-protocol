/**
 * Share pricing, as `staking::private` computes it, so a wallet can quote an entry or an
 * exit and pay the right fee without asking the chain per note.
 */
import type { PrivatePoolQuote } from './types';

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
const maxOf = (a: bigint, b: bigint) => (a > b ? a : b);

/**
 * ORB `shares` are worth now, rounded down (`value_of`): the offset price, never above the
 * pro-rata share (below a price of one, after a slash, the offset price is higher).
 */
export function privateShareValue(quote: PrivatePoolQuote, shares: bigint): bigint {
    if (shares <= 0n) return 0n;
    const { supply, netValue, windDown } = quote;
    if (windDown) {
        if (shares >= supply) return windDown.value;
        return (shares * windDown.value) / (supply > 0n ? supply : 1n);
    }
    if (shares >= supply) return netValue;
    const v = quote.virtualOffset;
    const priced = (shares * (netValue + v)) / (supply + v);
    const proRata = (shares * netValue) / supply;
    return priced < proRata ? priced : proRata;
}

/**
 * Shares an entry of `value` would take at the current price, rounded down. An estimate:
 * the entry is priced once its era compounds, after that era's rewards.
 */
export function privateSharesFor(quote: PrivatePoolQuote, value: bigint): bigint {
    if (value <= 0n || quote.windDown) return 0n;
    const v = quote.virtualOffset;
    return (value * (quote.supply + v)) / (quote.netValue + v);
}

/**
 * The smallest fee, in shares, a spend of the pool's share asset pays: shares worth at
 * least `minSpendFee`, rounded up, and at least one (`shares_worth`).
 */
export function privateMinFeeShares(quote: PrivatePoolQuote, minSpendFee: bigint): bigint {
    const { supply, windDown } = quote;
    const fee = windDown
        ? ceilDiv(
              minSpendFee * (supply > 0n ? supply : 1n),
              windDown.value > 0n ? windDown.value : 1n
          )
        : maxOf(
              ceilDiv(
                  minSpendFee * (supply + quote.virtualOffset),
                  quote.netValue + quote.virtualOffset
              ),
              // `privateShareValue` caps at pro rata: below a price of one, more shares.
              quote.netValue > 0n ? ceilDiv(minSpendFee * supply, quote.netValue) : 0n
          );
    return fee > 1n ? fee : 1n;
}
