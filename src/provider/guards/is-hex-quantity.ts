import type { HexString } from '../values/hex-string';

/** An EIP-1474 quantity: `0x` hex, at most 256 bits (`0x0`, `0x1a`, `0x0de0b6b3a7640000`). */
export function isHexQuantity(value: unknown): value is HexString {
    return typeof value === 'string' && /^0x[0-9a-fA-F]{1,64}$/.test(value);
}
