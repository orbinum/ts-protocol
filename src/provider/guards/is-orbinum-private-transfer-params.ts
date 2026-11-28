import type { OrbinumPrivateTransferParams } from '../orbinum/orbinum-private-transfer-params';
import { isPlanckString } from './is-planck-string';
import { isPrivacyAddressShape } from './is-privacy-address-shape';
import { isRecord } from './is-record';

export function isOrbinumPrivateTransferParams(
    value: unknown
): value is OrbinumPrivateTransferParams {
    return (
        isRecord(value) &&
        isPrivacyAddressShape(value['to']) &&
        isPlanckString(value['value']) &&
        value['value'] !== '0'
    );
}
