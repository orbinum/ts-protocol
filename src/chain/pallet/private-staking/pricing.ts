/**
 * Share pricing, as `staking::private` computes it, so a wallet can quote an entry or an
 * exit and pay the right fee without asking the chain per note.
 */
import type { PrivatePoolQuote } from './types';

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
const maxOf = (a: bigint, b: bigint) => (a > b ? a : b);

/** What the minted shares own: their points' value and the rewards not compounded yet. */
export function privateOwnedValue(quote: PrivatePoolQuote): bigint {
    return quote.netValue + quote.uncompounded;
}

/**
 * `shares`' part of `total` (`part_of`): the offset price, never above pro rata (below a
 * price of one, after a slash, the offset price is higher), all of it for the last shares.
 */
export function privatePartOf(quote: PrivatePoolQuote, shares: bigint, total: bigint): bigint {
    if (shares <= 0n) return 0n;
    const { supply } = quote;
    if (shares >= supply) return total;
    const v = quote.virtualOffset;
    const priced = (shares * (total + v)) / (supply + v);
    const proRata = (shares * total) / supply;
    return priced < proRata ? priced : proRata;
}

/** ORB `shares` are worth now, rounded down (`value_of`). */
export function privateShareValue(quote: PrivatePoolQuote, shares: bigint): bigint {
    if (shares <= 0n) return 0n;
    const { supply, windDown } = quote;
    if (windDown) {
        if (shares >= supply) return windDown.value;
        return (shares * windDown.value) / (supply > 0n ? supply : 1n);
    }
    return privatePartOf(quote, shares, privateOwnedValue(quote));
}

/**
 * Shares an entry of `value` would take at the current price, rounded down. An estimate:
 * the entry is priced once its era compounds, after that era's rewards.
 */
export function privateSharesFor(quote: PrivatePoolQuote, value: bigint): bigint {
    if (value <= 0n || quote.windDown) return 0n;
    const v = quote.virtualOffset;
    return (value * (quote.supply + v)) / (privateOwnedValue(quote) + v);
}

/**
 * The smallest fee, in shares, a spend of the pool's share asset pays: shares worth at
 * least `minSpendFee`, rounded up, and at least one (`shares_worth`).
 */
export function privateMinFeeShares(quote: PrivatePoolQuote, minSpendFee: bigint): bigint {
    const { supply, windDown } = quote;
    const owned = privateOwnedValue(quote);
    const fee = windDown
        ? ceilDiv(
              minSpendFee * (supply > 0n ? supply : 1n),
              windDown.value > 0n ? windDown.value : 1n
          )
        : maxOf(
              ceilDiv(minSpendFee * (supply + quote.virtualOffset), owned + quote.virtualOffset),
              // `privateShareValue` caps at pro rata: below a price of one, more shares.
              owned > 0n ? ceilDiv(minSpendFee * supply, owned) : 0n
          );
    return fee > 1n ? fee : 1n;
}
