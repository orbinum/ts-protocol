/**
 * Field-level checks shared by every call's validation: the widths and
 * encodings the pallet's argument types impose.
 */
import { isHexOfLength } from '../../../../../foundation/encoding/hex';
import { leHexToBigint } from '../../../../../foundation/encoding/bytes';
import { BN254_R } from '../../../../../foundation/crypto/constants';

const U32_MAX = 0xffff_ffff;
const U128_MAX = (1n << 128n) - 1n;

export function assertU32(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0 || value > U32_MAX) {
        throw new Error(`${field}: expected a uint32, got ${value}`);
    }
}

export function assertU128(value: bigint, field: string): void {
    if (typeof value !== 'bigint' || value < 0n || value > U128_MAX) {
        throw new Error(`${field}: expected 0..2^128-1, got ${value}`);
    }
}

export function assertPositiveU128(value: bigint, field: string): void {
    if (typeof value !== 'bigint' || value <= 0n || value > U128_MAX) {
        throw new Error(`${field}: expected 1..2^128-1, got ${value}`);
    }
}

/** A `[u8; 32]` / `Hash` argument: 0x-prefixed, exactly 32 bytes of hex. */
export function assertHash(value: string, field: string): void {
    if (!isHexOfLength(value, 32)) {
        throw new Error(`${field}: expected a 0x-prefixed 32-byte hex string`);
    }
}

export function assertProof(proof: Uint8Array, field: string): void {
    if (!(proof instanceof Uint8Array) || proof.length === 0) {
        throw new Error(`${field}: expected proof bytes, got none`);
    }
}

/**
 * A Merkle root as the pallet matches it: a canonical field element in 32-byte
 * little-endian hex. `r + x` names the same field element as `x` but no root
 * the chain ever recorded, so the spend would fail as an unknown root after a
 * proof was paid for.
 */
export function assertRoot(root: string, field: string): void {
    assertHash(root, field);
    if (leHexToBigint(root) >= BN254_R) {
        throw new Error(`${field}: not a canonical field element`);
    }
}
