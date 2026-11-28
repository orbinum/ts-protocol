/**
 * `@orbinum/protocol` — the public API.
 *
 * What a consumer that does NOT custody keys needs: chain access, encoding,
 * address handling, note types, and the payment-slip a dapp hands a wallet.
 * Nothing here derives or handles a spending key — that belongs in a wallet,
 * not in a package anyone can install.
 *
 * Two layers, re-exported in dependency order:
 *
 * ```
 * foundation/  encoding, crypto, formatting     no dependencies of its own
 * protocol/    what a note IS (public parts)    offline: no node in reach
 * chain/       talking to a node                needs a connection
 * ```
 *
 * Everything below is environment-agnostic — a browser tab, an extension
 * service worker, React Native, Node and Cloudflare Workers all run it.
 */

// ─── FOUNDATION ──────────────────────────────────────────────────────────────
// Encoding, crypto primitives and formatting. Nothing here depends on a layer
// above it, which is what makes this the safe place for anything shared.

export * from './foundation/index';

// ─── PROTOCOL (public) ───────────────────────────────────────────────────────
// The parts of the note protocol that carry no spend power: note types, the
// encrypted memo, the payment slip, note disclosure, forest geometry and
// local Merkle paths.
// Key derivation, note construction, ephemerals and proving are NOT here — the
// witness they build carries the spending key, so they live in the wallet.

export * from './protocol/index';

// ─── CHAIN ───────────────────────────────────────────────────────────────────
// Everything that needs a connection: the clients, the custom RPC endpoints,
// and the pallets that carry notes on chain.

export * from './chain/client/index';
export * from './chain/substrate/index';
export * from './chain/rpc/index';
export * from './chain/runtime/index';
export { ProtocolRefusal, protocolRefusal } from './chain/refusal';
export type { RefusalReason, RefusalDetail } from './chain/refusal';
export {
    classifyTxError,
    dispatchErrorPath,
    extractTxHash,
    parseModuleError,
} from './chain/txErrors';
export type { TxErrorKind } from './chain/txErrors';
export * from './chain/pallet/balances/index';
export * from './chain/pallet/shielded-pool/index';
export * from './chain/pallet/staking/index';
export * from './chain/pallet/nomination-pools/index';
export * from './chain/pallet/private-staking/index';
export * from './chain/pallet/private-call/index';
export * from './chain/pallet/zk-verifier/index';
export * from './chain/pallet/ismp/index';
export {
    ORBINUM_PALLET_IDS,
    ISMP_TREASURY_ACCOUNT,
    SHIELDED_POOL_ACCOUNT,
    palletAccountId,
    palletSubAccountId,
} from './chain/pallet/palletAccount';
export { toTxResult, feePaidFrom, signAndSubmitTx, transactionFeePaid } from './chain/tx';
export type { UnsafeTx, UnsafeTxOptions, SubmitOptions } from './chain/tx';
export type { TxFinalizedPayload } from 'polkadot-api';

// Surviving a connection that died between submit and finalization. Generic
// Substrate recovery: the on-chain predicate is the caller's.
export { isConnectionLossError, txLandedAfterError, recoveredTxResult } from './chain/txRecovery';
export type { TxLandingPollOptions } from './chain/txRecovery';

// The EVM side is named rather than splatted: its `precompiles/` barrel also
// carries the ABI encoder/decoder it uses internally, and a consumer has no
// reason to reach for `decodeUint` or a raw selector constant.
export {
    EvmClient,
    EvmExplorer,
    estimatePrivateCallGas,
    simulatePrivateCall,
} from './chain/evm/index';
export type {
    EvmBlock,
    EvmTransaction,
    EvmAddressInfo,
    EvmTxSummary,
    EvmLog,
    EvmSigner,
    EvmTxRequest,
    PrivateCallStepGas,
    PrivateCallStepResult,
    TokenInfo,
    TokenTransfer,
} from './chain/evm/index';
export {
    ShieldedPoolPrecompile,
    CryptoPrecompiles,
    PRECOMPILE_ADDR,
    KNOWN_PRECOMPILES,
    getPrecompileLabel,
    decodePrecompileCalldata,
} from './chain/evm/precompiles/index';
export type {
    KnownPrecompileInfo,
    DecodedPrecompile,
    PrecompileMethod,
} from './chain/evm/precompiles/index';
// The token standards, shared by every reader of EVM logs (indexer, explorer, wallet).
export {
    ERC_EVENT_TOPICS,
    ERC_SELECTORS,
    ercEventName,
    decodeAbiString,
    decodeAbiUint,
    encodeAbiAddress,
    encodeAbiUint256,
    decodeTokenTransfers,
} from './chain/evm/erc';
export type { EvmLogLike, DecodedTokenTransfer } from './chain/evm/erc';
// What an EVM account signs, built without a key: the wallet signs the hash.
export {
    rlpEncode,
    quantityBytes,
    EIP1559_TRANSACTION_TYPE,
    eip1559SigningHash,
    serializeSignedEip1559,
    personalMessageHash,
    encodeTypedDataType,
    typedDataTypeHash,
    typedDataStructHash,
    typedDataHash,
} from './chain/evm/index';
export type {
    RlpInput,
    AccessListEntry,
    Eip1559Signature,
    Eip1559Transaction,
    TypedData,
    TypedDataField,
} from './chain/evm/index';
