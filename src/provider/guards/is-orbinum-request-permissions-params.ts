import type { OrbinumRequestPermissionsParams } from '../orbinum/orbinum-request-permissions-params';
import { isRecord } from './is-record';

export function isOrbinumRequestPermissionsParams(
    value: unknown
): value is OrbinumRequestPermissionsParams {
    return isRecord(value) && value['privacy'] === true;
}
