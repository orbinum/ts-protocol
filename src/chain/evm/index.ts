/**
 * The EVM side of the chain.
 *
 * ```
 * EvmClient.ts   the JSON-RPC client
 * explorer/      enriched block, transaction and token queries
 * precompiles/   Orbinum's contracts, reachable from an EVM wallet
 * privateCall/   simulating and sizing a private call's steps from its executor
 * transaction/   EIP-1559 transactions, hashed for signing and serialised signed
 * signing/       EIP-191 and EIP-712 hashes, for personal_sign and signTypedData_v4
 * ```
 *
 * Optional throughout: a wallet that only speaks Substrate never touches this,
 * which is why `OrbinumClient.evm` is nullable rather than throwing.
 */
export { EvmClient } from './EvmClient';
export * from './explorer/index';
export * from './precompiles/index';
export * from './erc';
export {
    estimatePrivateCallGas,
    simulatePrivateCall,
    type PrivateCallStepGas,
    type PrivateCallStepResult,
} from './privateCall/index';
export {
    rlpEncode,
    quantityBytes,
    EIP1559_TRANSACTION_TYPE,
    eip1559SigningHash,
    serializeSignedEip1559,
    type RlpInput,
    type AccessListEntry,
    type Eip1559Signature,
    type Eip1559Transaction,
} from './transaction/index';
export {
    personalMessageHash,
    encodeTypedDataType,
    typedDataTypeHash,
    typedDataStructHash,
    typedDataHash,
    type TypedData,
    type TypedDataField,
} from './signing/index';
