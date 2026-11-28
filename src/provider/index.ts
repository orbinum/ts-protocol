/**
 * `@orbinum/protocol/provider`: how a dapp talks to Orbinum Wallet.
 *
 * Its own entry, with no peer at runtime: a dapp installs `@orbinum/protocol` and
 * imports this without loading polkadot-api. The wallet implements what is
 * described here; the dapp finds it and calls it.
 *
 * ```
 * discovery/   finding the wallet: window.orbinum, or its EIP-1193 provider
 * orbinum/     window.orbinum: methods, params, results, events
 * eip1193/     the EVM provider interface, and the methods the wallet answers
 * eip6963/     multi-wallet discovery: announcing and requesting providers
 * guards/      shape and size checks for every request, shared by dapp and wallet
 * errors/      the codes a provider rejects with, and a reader for them
 * page/        the page, reached without lib.dom and without throwing off-page
 * values/      hex and planck strings, as requests carry them
 * ```
 */
export {
    ORBINUM_INITIALIZED_EVENT,
    getOrbinumProvider,
    waitForOrbinumProvider,
    getOrbinumEip1193Provider,
} from './discovery/index';
export {
    ORBINUM_METHODS,
    isOrbinumMethod,
    type OrbinumProvider,
    type OrbinumRequest,
    type OrbinumMethod,
    type OrbinumMethods,
    type OrbinumEventMap,
    type OrbinumEventName,
    type OrbinumAccount,
    type OrbinumChainInfo,
    type OrbinumConnection,
    type OrbinumPermissions,
    type OrbinumRequestPermissionsParams,
    type OrbinumTransferParams,
    type OrbinumTransferReceipt,
    type OrbinumPrivateTransferParams,
    type OrbinumPrivateTransferReceipt,
    type OrbinumPrivateCallParams,
    type OrbinumPrivateCallStep,
    type OrbinumPrivateCallReceipt,
    type OrbinumSignMessageParams,
    type OrbinumSignature,
} from './orbinum/index';
export {
    ORBINUM_EIP1193_METHODS,
    isEip1193ReadMethod,
    isOrbinumEip1193Method,
    type RequestArguments,
    type Eip1193Provider,
    type Eip1193EventMap,
    type Eip1193EventName,
    type Eip1193ReadMethod,
    type OrbinumEip1193Method,
    type ProviderConnectInfo,
    type ProviderMessage,
    type EthTransactionRequest,
} from './eip1193/index';
export {
    EIP6963_ANNOUNCE_PROVIDER,
    EIP6963_REQUEST_PROVIDER,
    ORBINUM_WALLET_RDNS,
    isEip6963ProviderDetail,
    requestEip6963Providers,
    announceEip6963Provider,
    type Eip6963ProviderInfo,
    type Eip6963ProviderDetail,
} from './eip6963/index';
export {
    MAX_PLANCK,
    MAX_SIGN_MESSAGE_BYTES,
    MAX_TRANSACTION_DATA_BYTES,
    MAX_TYPED_DATA_CHARS,
    isRecord,
    isHexData,
    isHexQuantity,
    isPlanckString,
    isEvmAddressShape,
    isSs58Shape,
    isPrivacyAddressShape,
    isUtf8Within,
    isOrbinumRequestPermissionsParams,
    isOrbinumTransferParams,
    isOrbinumPrivateTransferParams,
    isOrbinumPrivateCallParams,
    isOrbinumSignMessageParams,
    isEthSendTransactionParams,
    isPersonalSignParams,
    isSignTypedDataV4Params,
    isSwitchChainParams,
} from './guards/index';
export {
    PROVIDER_ERROR_CODES,
    ProviderRpcError,
    providerRpcErrorOf,
    type ProviderErrorCode,
    type ProviderRpcErrorShape,
} from './errors/index';
export {
    getPageWindow,
    createPageEvent,
    type PageEvent,
    type PageEventListener,
    type PageWindow,
} from './page/index';
export type { HexString, PlanckString } from './values/index';
