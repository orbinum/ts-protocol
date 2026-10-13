import { toHex } from '../../../foundation/encoding/hex';
import { bigintTo32Be } from '../../../foundation/encoding/bytes';
import { concat, encodeDynamicParam, encodeStaticParam, STATIC_TYPES } from './helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The ABI types the precompile calls use — `shield(uint32, bytes32, bytes,
 * bytes, uint32)` needs no others.
 *
 * Static types occupy exactly one 32-byte head slot.
 * Dynamic types place an offset in the head and their content in the tail.
 */
export type AbiParam =
    | { type: 'uint'; value: bigint } // uint32 / uint256 — right-aligned
    | { type: 'bytes32'; value: Uint8Array } // exactly 32 bytes — left-aligned
    | { type: 'bytes'; value: Uint8Array }; // dynamic

// ─── Main encoder ─────────────────────────────────────────────────────────────

/**
 * ABI-encodes a function call (selector + parameters).
 *
 * Implements the standard Ethereum ABI encoding (static head + dynamic tail).
 *
 * @param selector  4-byte function selector (NOT keccak — use the hardcoded constants).
 * @param params    ABI parameters in declaration order.
 */
export function encode(selector: Uint8Array, ...params: AbiParam[]): Uint8Array {
    const n = params.length;
    const headSize = n * 32;
    const heads: Uint8Array[] = [];
    const tails: Uint8Array[] = [];
    let tailOffset = headSize;

    for (const param of params) {
        if (STATIC_TYPES.has(param.type)) {
            heads.push(encodeStaticParam(param));
        } else {
            heads.push(bigintTo32Be(BigInt(tailOffset)));
            const tail = encodeDynamicParam(param);
            tails.push(tail);
            tailOffset += tail.length;
        }
    }

    return concat([selector, ...heads, ...tails]);
}

/** Returns the 0x-prefixed hex of an encoded call. */
export function encodeHex(selector: Uint8Array, ...params: AbiParam[]): string {
    return toHex(encode(selector, ...params));
}

// ─── Decoders ─────────────────────────────────────────────────────────────────

/** Reads a big-endian uint256 from 32 bytes at `offset`. */
export function decodeUint(data: Uint8Array, offset = 0): bigint {
    let result = 0n;
    for (let i = 0; i < 32; i++) {
        result = (result << 8n) | BigInt(data[offset + i] ?? 0);
    }
    return result;
}
