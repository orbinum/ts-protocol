import type { HexString } from '../values/hex-string';

/** `0x` hex of whole bytes, at most `maxBytes` of them. `'0x'` is empty data. */
export function isHexData(value: unknown, maxBytes: number): value is HexString {
    return (
        typeof value === 'string' &&
        value.length <= 2 + maxBytes * 2 &&
        /^0x([0-9a-fA-F]{2})*$/.test(value)
    );
}
