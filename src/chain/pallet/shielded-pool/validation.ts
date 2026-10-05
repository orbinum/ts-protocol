/**
 * Parameter checks shared by the pallet call and the precompile calldata. Both
 * reach the same dispatchable, so they must accept exactly the same values.
 *
 * These throw: the parameters are the wallet's own outgoing call, so a bad one
 * is a bug in the caller, not hostile input to tolerate.
 */
import { MemoFormat } from '../../../protocol/memo/index';
import { isHexOfLength } from '../../../foundation/encoding/hex';
import type { ClaimRelayFeesParams, ShieldParams } from './extrinsicParams';

const U32_MAX = 0xffff_ffff;
const U128_MAX = (1n << 128n) - 1n;

function assertU32(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0 || value > U32_MAX) {
        throw new Error(`${field}: expected a uint32, got ${value}`);
    }
}

function assertPositiveU128(value: bigint, field: string): void {
    if (value <= 0n || value > U128_MAX) {
        throw new Error(`${field}: expected 1..2^128-1, got ${value}`);
    }
}

/** `claim_relay_fees(asset_id: u32, amount: u128)`, with a positive amount. */
export function assertClaimRelayFeesParams(params: ClaimRelayFeesParams, where: string): void {
    assertU32(params.assetId, `${where}.assetId`);
    assertPositiveU128(params.amount, `${where}.amount`);
}

/**
 * `shield(asset_id: u32, amount: u128, commitment: [u8; 32], encrypted_memo,
 * proof, circuit_version: u32)`, with a positive amount, a valid memo and a proof.
 */
export function assertShieldParams(params: ShieldParams, where: string): void {
    assertU32(params.assetId, `${where}.assetId`);
    assertPositiveU128(params.amount, `${where}.amount`);
    if (!isHexOfLength(params.commitment, 32)) {
        throw new Error(`${where}.commitment: expected a 0x-prefixed 32-byte hex string`);
    }
    MemoFormat.validate(params.encryptedMemo, `${where}.encryptedMemo`);
    if (params.proof.length === 0) {
        throw new Error(`${where}.proof: expected a shield proof, got none`);
    }
    assertU32(params.circuitVersion, `${where}.circuitVersion`);
}
