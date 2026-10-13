import { bigintTo32Be } from '../../../foundation/encoding/bytes';
import type { AbiParam } from './abi';

export const STATIC_TYPES = new Set<string>(['uint', 'bytes32']);

export function concat(arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((sum, array) => sum + array.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const array of arrays) {
        out.set(array, offset);
        offset += array.length;
    }
    return out;
}

export function padTo32Multiple(data: Uint8Array): Uint8Array {
    const rem = data.length % 32;
    if (rem === 0) return data;
    const padded = new Uint8Array(data.length + (32 - rem));
    padded.set(data);
    return padded;
}

/**
 * A `bytes32` slot from exactly 32 bytes.
 *
 * Never reshaped to fit: truncating a longer value or zero-padding a shorter
 * one both yield a well-formed slot holding a DIFFERENT value. These bytes
 * become commitments and nullifiers, where a changed value is not an error the
 * chain reports but a note nobody can find or spend.
 */
function bytes32Slot(value: Uint8Array): Uint8Array {
    if (value.length !== 32) {
        throw new Error(`encodeAbi: bytes32 needs 32 bytes, got ${value.length}`);
    }
    const slot = new Uint8Array(32);
    slot.set(value);
    return slot;
}

export function encodeStaticParam(param: AbiParam): Uint8Array {
    switch (param.type) {
        case 'uint': {
            return bigintTo32Be(param.value);
        }
        case 'bytes32': {
            return bytes32Slot(param.value);
        }
        default:
            throw new Error(
                `encodeStatic: not a static ABI type: ${(param as { type: string }).type}`
            );
    }
}

export function encodeDynamicParam(param: AbiParam): Uint8Array {
    switch (param.type) {
        case 'bytes': {
            const data = param.value;
            return concat([bigintTo32Be(BigInt(data.length)), padTo32Multiple(data)]);
        }
        default:
            throw new Error(
                `encodeDynamic: not a dynamic ABI type: ${(param as { type: string }).type}`
            );
    }
}
