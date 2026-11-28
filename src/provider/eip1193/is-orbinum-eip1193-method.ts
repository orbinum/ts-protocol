import { ORBINUM_EIP1193_METHODS, type OrbinumEip1193Method } from './eip1193-methods';

const ANSWERED: ReadonlySet<string> = new Set(Object.values(ORBINUM_EIP1193_METHODS).flat());

/** Whether Orbinum Wallet answers `method` on its EIP-1193 provider. */
export function isOrbinumEip1193Method(method: unknown): method is OrbinumEip1193Method {
    return typeof method === 'string' && ANSWERED.has(method);
}
