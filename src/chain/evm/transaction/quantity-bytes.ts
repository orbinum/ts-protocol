/**
 * An unsigned integer as RLP carries it: big-endian with no leading zero byte, and
 * zero as the empty string. `0x00` for zero would be a different, non-canonical
 * encoding, which nodes reject.
 */
export function quantityBytes(value: bigint, where: string): Uint8Array {
    if (value < 0n) throw new Error(`${where}: expected a non-negative integer, got ${value}`);
    const bytes: number[] = [];
    for (let rest = value; rest > 0n; rest >>= 8n) bytes.unshift(Number(rest & 0xffn));
    return Uint8Array.from(bytes);
}
