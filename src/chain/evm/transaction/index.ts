/**
 * EVM transactions, built for signing: no key here. A wallet hashes with
 * `eip1559SigningHash`, signs the hash with its own key, and submits what
 * `serializeSignedEip1559` returns through `EvmClient.sendRawTransaction`.
 *
 * ```
 * rlp-encode.ts                 Ethereum's serialisation
 * quantity-bytes.ts             an integer as RLP carries it
 * eip1559-transaction.ts        the transaction and its signature
 * eip1559-fields.ts             the payload, checked (shared by hash and serialisation)
 * eip1559-signing-hash.ts       what the wallet signs
 * serialize-signed-eip1559.ts   what the node takes
 * ```
 */
export { rlpEncode, type RlpInput } from './rlp-encode';
export { quantityBytes } from './quantity-bytes';
export type { AccessListEntry, Eip1559Signature, Eip1559Transaction } from './eip1559-transaction';
export { EIP1559_TRANSACTION_TYPE, eip1559SigningHash } from './eip1559-signing-hash';
export { serializeSignedEip1559 } from './serialize-signed-eip1559';
