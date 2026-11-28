/**
 * EIP-712 `hashStruct`: a struct value hashed with its type, every member encoded
 * to one 32-byte word.
 */
import { keccak_256 } from '@noble/hashes/sha3.js';
import { fromHex } from '../../../foundation/encoding/hex';
import { concatBytes } from '../transaction/concat-bytes';
import type { TypedDataField } from './typed-data';
import { baseTypeOf, typedDataTypeHash } from './typed-data-type-hash';

type Types = Record<string, TypedDataField[]>;

/** `hashStruct(type, value)` = `keccak256(typeHash ‖ encodeData(value))`. */
export function typedDataStructHash(
    type: string,
    value: unknown,
    types: Types,
    where: string
): Uint8Array {
    const fields = types[type];
    if (fields === undefined) throw new Error(`${where}: no struct named "${type}"`);
    if (!isRecord(value)) throw new Error(`${where}: expected an object for ${type}`);
    const words = fields.map((field) =>
        encodeValue(field.type, value[field.name], types, `${where}.${field.name}`)
    );
    return keccak_256(concatBytes([typedDataTypeHash(type, types), ...words]));
}

/** One member as its 32-byte word. */
function encodeValue(type: string, value: unknown, types: Types, where: string): Uint8Array {
    const array = /^(.*)\[(\d*)\]$/.exec(type);
    if (array) {
        const [, element, length] = array as unknown as [string, string, string];
        if (!Array.isArray(value)) throw new Error(`${where}: expected an array for ${type}`);
        if (length !== '' && value.length !== Number(length)) {
            throw new Error(`${where}: expected ${length} items, got ${value.length}`);
        }
        return keccak_256(
            concatBytes(value.map((item, i) => encodeValue(element, item, types, `${where}[${i}]`)))
        );
    }
    if (types[baseTypeOf(type)] !== undefined)
        return typedDataStructHash(type, value, types, where);
    if (type === 'string') {
        if (typeof value !== 'string') throw new Error(`${where}: expected a string`);
        return keccak_256(new TextEncoder().encode(value));
    }
    if (type === 'bytes') return keccak_256(bytesOf(value, where));
    if (type === 'bool') {
        if (typeof value !== 'boolean') throw new Error(`${where}: expected a boolean`);
        return word(value ? 1n : 0n);
    }
    if (type === 'address') {
        const bytes = bytesOf(value, where);
        if (bytes.length !== 20) throw new Error(`${where}: expected a 20-byte address`);
        return leftPad(bytes);
    }
    const fixedBytes = /^bytes(\d+)$/.exec(type);
    if (fixedBytes) {
        const size = Number(fixedBytes[1]);
        const bytes = bytesOf(value, where);
        if (size < 1 || size > 32 || bytes.length !== size) {
            throw new Error(`${where}: expected ${size} bytes for ${type}`);
        }
        const out = new Uint8Array(32);
        out.set(bytes);
        return out;
    }
    const integer = /^(u?)int(\d*)$/.exec(type);
    if (integer) {
        const unsigned = integer[1] === 'u';
        const bits = integer[2] === '' ? 256 : Number(integer[2]);
        if (bits < 8 || bits > 256 || bits % 8 !== 0) throw new Error(`${where}: bad type ${type}`);
        const n = integerOf(value, where);
        const max = unsigned ? (1n << BigInt(bits)) - 1n : (1n << BigInt(bits - 1)) - 1n;
        const min = unsigned ? 0n : -(1n << BigInt(bits - 1));
        if (n < min || n > max) throw new Error(`${where}: ${n} does not fit ${type}`);
        // Two's complement over the whole word, as the ABI encodes a negative integer.
        return word(n < 0n ? (1n << 256n) + n : n);
    }
    throw new Error(`${where}: unsupported type ${type}`);
}

function integerOf(value: unknown, where: string): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
    if (typeof value === 'string' && /^(-?\d+|0x[0-9a-fA-F]+)$/.test(value)) return BigInt(value);
    throw new Error(`${where}: expected an integer (number, decimal or 0x string)`);
}

function bytesOf(value: unknown, where: string): Uint8Array {
    if (value instanceof Uint8Array) return value;
    if (typeof value === 'string' && /^0x([0-9a-fA-F]{2})*$/.test(value)) return fromHex(value);
    throw new Error(`${where}: expected 0x hex bytes`);
}

function word(n: bigint): Uint8Array {
    const out = new Uint8Array(32);
    for (let i = 31, rest = n; i >= 0; i--, rest >>= 8n) out[i] = Number(rest & 0xffn);
    return out;
}

function leftPad(bytes: Uint8Array): Uint8Array {
    const out = new Uint8Array(32);
    out.set(bytes, 32 - bytes.length);
    return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
