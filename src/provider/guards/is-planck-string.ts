import type { PlanckString } from '../values/planck-string';
import { MAX_PLANCK } from './limits';

/** A planck amount as a canonical decimal string (no sign, no leading zero), within `u128`. */
export function isPlanckString(value: unknown): value is PlanckString {
    return (
        typeof value === 'string' &&
        /^(0|[1-9]\d{0,38})$/.test(value) &&
        BigInt(value) <= MAX_PLANCK
    );
}
