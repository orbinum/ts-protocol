/**
 * EIP-6963, how a dapp finds wallets without fighting over `window.ethereum`: each
 * wallet announces itself, and the dapp picks by `rdns`.
 */
export type { Eip6963ProviderInfo } from './eip6963-provider-info';
export type { Eip6963ProviderDetail } from './eip6963-provider-detail';
export { EIP6963_ANNOUNCE_PROVIDER, EIP6963_REQUEST_PROVIDER } from './eip6963-events';
export { ORBINUM_WALLET_RDNS } from './orbinum-rdns';
export { isEip6963ProviderDetail } from './is-eip6963-provider-detail';
export { requestEip6963Providers } from './request-eip6963-providers';
export { announceEip6963Provider } from './announce-eip6963-provider';
