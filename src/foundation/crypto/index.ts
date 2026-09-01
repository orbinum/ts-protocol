/**
 * Curve arithmetic and the field constants it shares.
 *
 * Public-safe primitives with a real consumer only: field constants, generic
 * curve multiplication, and viewing-public-key validation (the payment slip
 * uses it). Stealth derivation and note blinding take or produce spend power,
 * so they are custody and live in the wallet, not here.
 */
export { BN254_R, BABYJUB_SUBORDER } from './constants';
export { unpackUsableViewingKey } from './bjj';
export { fastMulBase, fastMulPoint } from './bjj-fast';
// The capability guards travel with the error they throw: a host that catches
// `MissingCryptoError` is the same host that wants to check for the capability
// before it reaches a failure. They inspect `globalThis.crypto` and touch no
// key, and exporting them here keeps the wallet SDK from reimplementing them —
// which it did, until two definitions of `requireSubtleCrypto` existed.
export { MissingCryptoError, requireRandomValues, requireSubtleCrypto } from './capability';
export type { CryptoKey } from './webcrypto';
