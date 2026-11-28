import type { OrbinumTransferParams } from '../orbinum/orbinum-transfer-params';
import { isEvmAddressShape } from './is-evm-address-shape';
import { isPlanckString } from './is-planck-string';
import { isRecord } from './is-record';
import { isSs58Shape } from './is-ss58-shape';

export function isOrbinumTransferParams(value: unknown): value is OrbinumTransferParams {
    return (
        isRecord(value) &&
        (isSs58Shape(value['to']) || isEvmAddressShape(value['to'])) &&
        isPlanckString(value['value']) &&
        value['value'] !== '0'
    );
}
