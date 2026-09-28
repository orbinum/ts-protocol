/**
 * Parameter checks shared by the pallet call and the precompile calldata. Both
 * reach the same dispatchable, so they must accept exactly the same values.
 *
 * These throw: the parameters are the wallet's own outgoing call, so a bad one
 * is a bug in the caller, not hostile input to tolerate.
 */
import type { ClaimRelayFeesParams } from './extrinsicParams';

const U32_MAX = 0xffff_ffff;
const U128_MAX = (1n << 128n) - 1n;

/** `claim_relay_fees(asset_id: u32, amount: u128)`, with a positive amount. */
export function assertClaimRelayFeesParams(params: ClaimRelayFeesParams, where: string): void {
    const { assetId, amount } = params;
    if (!Number.isInteger(assetId) || assetId < 0 || assetId > U32_MAX) {
        throw new Error(`${where}.assetId: expected a uint32, got ${assetId}`);
    }
    if (amount <= 0n || amount > U128_MAX) {
        throw new Error(`${where}.amount: expected 1..2^128-1, got ${amount}`);
    }
}
