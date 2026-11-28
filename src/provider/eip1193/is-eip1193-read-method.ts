import { ORBINUM_EIP1193_METHODS, type Eip1193ReadMethod } from './eip1193-methods';

const READS: ReadonlySet<string> = new Set(ORBINUM_EIP1193_METHODS.reads);

/** Whether `method` is a public read the wallet forwards to its node without asking. */
export function isEip1193ReadMethod(method: unknown): method is Eip1193ReadMethod {
    return typeof method === 'string' && READS.has(method);
}
