/**
 * The bottom layer: everything with no dependency of its own.
 *
 * ```
 * encoding/   hex, bytes, base64, base64url — the wire formats
 * crypto/     BabyJubJub, curve constants, WebCrypto types
 * text/       balance formatting, amount parsing, string helpers
 * address.ts  EVM/SS58 conversion and the circuit's address mapping
 * ```
 *
 * Nothing here imports from another layer, which is the whole rule: a module
 * that needs `protocol` or `chain` does not belong in `foundation`.
 */
export * from './encoding/index';
export * from './crypto/index';
export * from './text/index';
export * from './address';
