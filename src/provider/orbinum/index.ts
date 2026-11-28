/**
 * `window.orbinum`: the Orbinum-native provider, for what EIP-1193 has no words for —
 * public ORB transfers from the substrate account, private payments, private calls.
 *
 * ```
 * orbinum-provider.ts   the provider and its typed request
 * orbinum-methods.ts    every method: params and result
 * orbinum-events.ts     what it emits
 * orbinum-*.ts          one params, result or value type per file
 * ```
 */
export type { OrbinumProvider, OrbinumRequest } from './orbinum-provider';
export { ORBINUM_METHODS, type OrbinumMethod, type OrbinumMethods } from './orbinum-methods';
export { isOrbinumMethod } from './is-orbinum-method';
export type { OrbinumEventMap, OrbinumEventName } from './orbinum-events';
export type { OrbinumAccount } from './orbinum-account';
export type { OrbinumChainInfo } from './orbinum-chain-info';
export type { OrbinumConnection, OrbinumPermissions } from './orbinum-permissions';
export type { OrbinumRequestPermissionsParams } from './orbinum-request-permissions-params';
export type { OrbinumTransferParams } from './orbinum-transfer-params';
export type { OrbinumTransferReceipt } from './orbinum-transfer-receipt';
export type { OrbinumPrivateTransferParams } from './orbinum-private-transfer-params';
export type { OrbinumPrivateTransferReceipt } from './orbinum-private-transfer-receipt';
export type {
    OrbinumPrivateCallParams,
    OrbinumPrivateCallStep,
} from './orbinum-private-call-params';
export type { OrbinumPrivateCallReceipt } from './orbinum-private-call-receipt';
export type { OrbinumSignMessageParams } from './orbinum-sign-message-params';
export type { OrbinumSignature } from './orbinum-signature';
