import type { ClaimFeesParams } from '../../types/params';
import { assertPositiveU128, assertU32 } from './primitives';

/** `claim_fees(asset_id: u32, amount: u128)`, with a positive amount. */
export function assertClaimFeesParams(params: ClaimFeesParams, where: string): void {
    assertU32(params.assetId, `${where}.assetId`);
    assertPositiveU128(params.amount, `${where}.amount`);
}
