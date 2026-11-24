/** `evm::private_call::Request`: its SCALE codec, its runtime field names, and reading it back. */
import { Bytes, Struct, Vector, u128, u32, u64 } from '@polkadot-api/substrate-bindings';
import { toHex } from '../../../foundation/encoding/hex';
import { readAmount, readBytes, readStruct } from '../fields/index';
import type { PrivateCallRequest, PrivateCallStep } from './types';

const key32 = Bytes(32);

export const privateCallCodec = Struct({
    deadline: u32,
    gas_limit: u64,
    steps: Vector(Struct({ target: Bytes(20), input: Bytes(), value: u128 })),
    min_return: u128,
    owner_pk: key32,
    blinding: key32,
});

/**
 * The request with the runtime's field names: `key` renders the 32-byte keys and
 * `address` a step's 20-byte target; calldata stays bytes.
 */
export function privateCallFields<K, A>(
    call: PrivateCallRequest,
    key: (bytes: Uint8Array) => K,
    address: (hex: string) => A
) {
    return {
        deadline: call.deadline,
        gas_limit: call.gasLimit,
        steps: call.steps.map((step) => ({
            target: address(step.target.toLowerCase()),
            input: step.input,
            value: step.value,
        })),
        min_return: call.minReturn,
        owner_pk: key(call.ownerPk),
        blinding: key(call.blinding),
    };
}

/** The request from its decoded form, or null; not checked. */
export function readPrivateCall(raw: unknown): PrivateCallRequest | null {
    const body = readStruct(raw);
    const rawSteps = body['steps'];
    if (!Array.isArray(rawSteps)) return null;
    const steps: PrivateCallStep[] = [];
    for (const rawStep of rawSteps) {
        const s = readStruct(rawStep);
        const target = readBytes(s['target'], 20);
        const input = readBytes(s['input']);
        const value = readAmount(s['value']);
        if (!target || !input || value === null) return null;
        steps.push({ target: toHex(target), input, value });
    }
    const gasLimit = readAmount(body['gas_limit']);
    const minReturn = readAmount(body['min_return']);
    const ownerPk = readBytes(body['owner_pk'], 32);
    const blinding = readBytes(body['blinding'], 32);
    if (gasLimit === null || minReturn === null || !ownerPk || !blinding) return null;
    return { deadline: Number(body['deadline']), gasLimit, steps, minReturn, ownerPk, blinding };
}
