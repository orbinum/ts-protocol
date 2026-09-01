/**
 * The bottom layer: everything with no dependency of its own.
 *
 * ```
 * encoding/   hex, bytes, base64, base64url — the wire formats
 * crypto/     BabyJubJub, blinding, curve constants, WebCrypto types
 * text/       balance formatting, amount parsing, string helpers
 * address.ts  EVM/SS58 conversion and the circuit's address mapping
 * jsonRpcHttp JSON-RPC over HTTP, with no Orbinum in it
 * ```
 *
 * Nothing here imports from another layer, which is the whole rule: a module
 * that needs `protocol` or `chain` does not belong in `foundation`.
 *
 * `errors/abort` used to live here, holding the abort a scan throws. It moved
 * out with the scanner: a package that never scans should not export a scan
 * abort.
 */
export * from './encoding/index';
export * from './crypto/index';
export * from './text/index';
export * from './address';
// `jsonRpcHttp` is deliberately NOT re-exported: it is how `SubstrateClient`
// batches, not something a consumer composes with. Import it by path if a host
// genuinely needs its own batching.
