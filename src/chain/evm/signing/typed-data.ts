/**
 * EIP-712 typed data, as `eth_signTypedData_v4` carries it (after `JSON.parse`).
 *
 * Values arrive from a dapp as JSON, so integers may be numbers, decimal strings or
 * `0x` hex strings, and bytes are `0x` hex strings. The encoder accepts each of those
 * and refuses anything else, naming the field.
 */

/** One member of a struct type. */
export interface TypedDataField {
    name: string;
    /** An atomic type (`uint256`, `address`, `bytes32`…), `string`, `bytes`, a struct name, or an array of any of them (`T[]`, `T[n]`). */
    type: string;
}

export interface TypedData {
    /** Every struct type, by name; `EIP712Domain` may be omitted and is then derived from `domain`. */
    types: Record<string, TypedDataField[]>;
    primaryType: string;
    domain: Record<string, unknown>;
    message: Record<string, unknown>;
}
