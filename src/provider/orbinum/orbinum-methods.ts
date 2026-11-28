import type { OrbinumAccount } from './orbinum-account';
import type { OrbinumChainInfo } from './orbinum-chain-info';
import type { OrbinumPermissions } from './orbinum-permissions';
import type { OrbinumPrivateCallParams } from './orbinum-private-call-params';
import type { OrbinumPrivateCallReceipt } from './orbinum-private-call-receipt';
import type { OrbinumPrivateTransferParams } from './orbinum-private-transfer-params';
import type { OrbinumPrivateTransferReceipt } from './orbinum-private-transfer-receipt';
import type { OrbinumRequestPermissionsParams } from './orbinum-request-permissions-params';
import type { OrbinumSignMessageParams } from './orbinum-sign-message-params';
import type { OrbinumSignature } from './orbinum-signature';
import type { OrbinumTransferParams } from './orbinum-transfer-params';
import type { OrbinumTransferReceipt } from './orbinum-transfer-receipt';

/**
 * Every method of `window.orbinum`: what it takes and what it resolves to.
 *
 * Asking costs nothing for the reads; `orbinum_requestAccounts` and
 * `orbinum_requestPermissions` ask the user once per origin; every payment and
 * signature asks the user every time.
 */
export interface OrbinumMethods {
    /** Connects publicly: asks the user, once, to share the selected account. */
    orbinum_requestAccounts: { params: undefined; result: OrbinumAccount[] };
    /**
     * Connects privately: asks the user, once, to connect without sharing any
     * account. A site already connected is answered with what it has.
     */
    orbinum_requestPrivateConnection: { params: undefined; result: OrbinumPermissions };
    /** The `orbpriv3:` address, once this origin has the `privacy` permission; else null. */
    orbinum_privacyAddress: { params: undefined; result: string | null };
    /** The accounts this origin may use, without asking: empty when not connected. */
    orbinum_accounts: { params: undefined; result: OrbinumAccount[] };
    orbinum_chain: { params: undefined; result: OrbinumChainInfo };
    orbinum_permissions: { params: undefined; result: OrbinumPermissions };
    orbinum_requestPermissions: {
        params: OrbinumRequestPermissionsParams;
        result: OrbinumPermissions;
    };
    orbinum_transfer: { params: OrbinumTransferParams; result: OrbinumTransferReceipt };
    orbinum_privateTransfer: {
        params: OrbinumPrivateTransferParams;
        result: OrbinumPrivateTransferReceipt;
    };
    orbinum_privateCall: { params: OrbinumPrivateCallParams; result: OrbinumPrivateCallReceipt };
    orbinum_signMessage: { params: OrbinumSignMessageParams; result: OrbinumSignature };
}

export type OrbinumMethod = keyof OrbinumMethods;

/** Every method name, for a wallet's dispatcher and for `isOrbinumMethod`. */
export const ORBINUM_METHODS = [
    'orbinum_requestAccounts',
    'orbinum_requestPrivateConnection',
    'orbinum_privacyAddress',
    'orbinum_accounts',
    'orbinum_chain',
    'orbinum_permissions',
    'orbinum_requestPermissions',
    'orbinum_transfer',
    'orbinum_privateTransfer',
    'orbinum_privateCall',
    'orbinum_signMessage',
] as const satisfies readonly OrbinumMethod[];
