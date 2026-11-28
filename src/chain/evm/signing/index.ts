/**
 * What an EVM account signs besides a transaction: the hashes, no key. A wallet signs
 * the 32 bytes these return with its secp256k1 key.
 *
 * ```
 * personal-message-hash.ts    EIP-191, for personal_sign
 * typed-data.ts               EIP-712 typed data, as eth_signTypedData_v4 sends it
 * typed-data-type-hash.ts     encodeType / typeHash
 * typed-data-struct-hash.ts   hashStruct
 * typed-data-hash.ts          the digest signed
 * ```
 */
export { personalMessageHash } from './personal-message-hash';
export type { TypedData, TypedDataField } from './typed-data';
export { encodeTypedDataType, typedDataTypeHash } from './typed-data-type-hash';
export { typedDataStructHash } from './typed-data-struct-hash';
export { typedDataHash } from './typed-data-hash';
