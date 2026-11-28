/**
 * An amount of ORB in planck (10⁻¹⁸ ORB), as a decimal string: `'1500000000000000000'`
 * is 1.5 ORB.
 *
 * A string because a request crosses `postMessage` and an extension port, and JSON has
 * no integer wide enough: a `number` loses precision past 2⁵³ planck (0.009 ORB).
 * Build one with `String(amount)` from a `bigint`, and read one with `BigInt(text)`.
 */
export type PlanckString = string;
