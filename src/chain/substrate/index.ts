export { SubstrateClient } from './SubstrateClient';
export type { DynamicBuilder, ExtrinsicDecoder } from './SubstrateClient';
export type {
    ChainInfo,
    SystemHealth,
    EventRecord,
    EventPhase,
    EventData,
    RawBlockHeader,
    RawBlock,
    BlockInfo,
} from './types';
// Decoding an extrinsic's arguments and the events it emitted.
export * from './extrinsic/index';

// ─── SCALE primitives, re-exported ───────────────────────────────────────────
// A consumer decoding storage or building a call needs these, and pinning them
// here means they cannot drift from the polkadot-api version this SDK compiles
// against.
export {
    Blake2256,
    AccountId,
    u128,
    u64,
    Storage,
    Keccak256,
} from '@polkadot-api/substrate-bindings';
export { base58 } from '@scure/base';
export { getSs58AddressInfo } from 'polkadot-api';
/**
 * What signs a transaction.
 *
 * polkadot-api 3 replaced `PolkadotSigner` with a `TxCreator`: the object no
 * longer just signs bytes handed to it, it CREATES the transaction and owns the
 * key while doing so. The SDK's own name is unchanged, so a consumer typed
 * against `SubstrateSigner` keeps compiling — what it must change is how it
 * BUILDS one (`getSubstrateSigner`, below, has the same signature).
 */
export type { SignerTxCreator as SubstrateSigner } from 'polkadot-api/tx-creator';

// ─── Signers ─────────────────────────────────────────────────────────────────
/** Discovering a browser wallet, guarded for hosts that have no page. */
export {
    hasInjectedExtensions,
    getInjectedExtensions,
    connectInjectedExtension,
} from './injectedExtensions';

/**
 * From a raw keypair — servers, tests, and any host with no extension.
 *
 * Same `(publicKey, signingType, sign)` signature it always had; in
 * polkadot-api 3 it comes from the tx-creator side, since what it returns now
 * creates the transaction rather than only signing it.
 */
export { getTxCreator as getSubstrateSigner } from 'polkadot-api/tx-creator';
/** From a browser wallet extension. Pair with `hasInjectedExtensions()`. */
export { getTxCreatorFromPjs as getSubstrateSignerFromExtension } from 'polkadot-api/pjs-signer';
export type { SignPayload, SignRaw } from 'polkadot-api/pjs-signer';
