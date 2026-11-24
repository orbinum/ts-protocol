/** The runtime's integer types, as bound actions carry them. */

export const U32_MAX = 0xffff_ffff;
export const U64_MAX = (1n << 64n) - 1n;
export const U128_MAX = (1n << 128n) - 1n;

/** Throws unless `value` is a `u32`. */
export function assertU32(value: number, where: string): void {
    if (!Number.isInteger(value) || value < 0 || value > U32_MAX) {
        throw new Error(`${where}: expected a uint32, got ${value}`);
    }
}

/** Throws unless `value` is a `u64`. */
export function assertU64(value: bigint, where: string): void {
    if (typeof value !== 'bigint' || value < 0n || value > U64_MAX) {
        throw new Error(`${where}: expected a uint64, got ${value}`);
    }
}

/** Throws unless `value` is a `u128`. */
export function assertU128(value: bigint, where: string): void {
    if (typeof value !== 'bigint' || value < 0n || value > U128_MAX) {
        throw new Error(`${where}: expected a uint128, got ${value}`);
    }
}
