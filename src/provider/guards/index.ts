/**
 * Shape and size checks for what a page sends a wallet, one per method. They never
 * check meaning: a well-formed SS58 string may still carry a bad checksum, and the
 * wallet verifies that with the full SDK. A dapp may run them before sending, to fail
 * early; the wallet runs them on everything it receives.
 */
export {
    MAX_PLANCK,
    MAX_SIGN_MESSAGE_BYTES,
    MAX_TRANSACTION_DATA_BYTES,
    MAX_TYPED_DATA_CHARS,
} from './limits';
export { isRecord } from './is-record';
export { isHexData } from './is-hex-data';
export { isHexQuantity } from './is-hex-quantity';
export { isPlanckString } from './is-planck-string';
export { isEvmAddressShape } from './is-evm-address-shape';
export { isSs58Shape } from './is-ss58-shape';
export { isPrivacyAddressShape } from './is-privacy-address-shape';
export { isUtf8Within } from './is-utf8-within';
export { isOrbinumRequestPermissionsParams } from './is-orbinum-request-permissions-params';
export { isOrbinumTransferParams } from './is-orbinum-transfer-params';
export { isOrbinumPrivateTransferParams } from './is-orbinum-private-transfer-params';
export { isOrbinumPrivateCallParams } from './is-orbinum-private-call-params';
export { isOrbinumSignMessageParams } from './is-orbinum-sign-message-params';
export { isEthSendTransactionParams } from './is-eth-send-transaction-params';
export { isPersonalSignParams } from './is-personal-sign-params';
export { isSignTypedDataV4Params } from './is-sign-typed-data-v4-params';
export { isSwitchChainParams } from './is-switch-chain-params';
