import {
    PRIVATE_CALL_MAX_INPUT,
    PRIVATE_CALL_MAX_STEPS,
} from '../../protocol/bound/privateCall/limits';
import type {
    OrbinumPrivateCallParams,
    OrbinumPrivateCallStep,
} from '../orbinum/orbinum-private-call-params';
import { isEvmAddressShape } from './is-evm-address-shape';
import { isHexData } from './is-hex-data';
import { isPlanckString } from './is-planck-string';
import { isRecord } from './is-record';

/**
 * Within the runtime's bounds: 1 to 8 steps, 16 KiB of calldata each, and the steps'
 * values no more than `amount`. The chain would refuse anything else after taking the
 * fee, so a dapp learns it here instead.
 */
export function isOrbinumPrivateCallParams(value: unknown): value is OrbinumPrivateCallParams {
    if (!isRecord(value)) return false;
    const { steps, amount, minReturn } = value;
    if (!isPlanckString(amount) || amount === '0' || !isPlanckString(minReturn)) return false;
    if (!Array.isArray(steps) || steps.length === 0 || steps.length > PRIVATE_CALL_MAX_STEPS) {
        return false;
    }
    if (!steps.every(isStep)) return false;
    const sent = steps.reduce((total, step) => total + BigInt(step.value), 0n);
    return sent <= BigInt(amount);
}

function isStep(value: unknown): value is OrbinumPrivateCallStep {
    return (
        isRecord(value) &&
        isEvmAddressShape(value['target']) &&
        isHexData(value['input'], PRIVATE_CALL_MAX_INPUT) &&
        isPlanckString(value['value'])
    );
}
