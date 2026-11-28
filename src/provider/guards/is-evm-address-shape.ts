import type { HexString } from '../values/hex-string';

/**
 * A 20-byte `0x` address, any case. The shape only: whether a mixed-case address
 * carries a valid EIP-55 checksum is the wallet's check, with the full SDK.
 */
export function isEvmAddressShape(value: unknown): value is HexString {
    return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}
