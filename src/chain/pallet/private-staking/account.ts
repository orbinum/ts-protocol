/**
 * A pool's private member `m_P`: the keyless account that holds every private member's
 * stake, `PalletId(*b"orb/pstk").into_sub_account_truncating(pool_id)`, i.e.
 * `"modl" ‖ "orb/pstk" ‖ u32_le(pool_id)` zero-padded to 32 bytes. It is a bound spend's
 * recipient, so the proof names it.
 */
import { accountIdHexToSs58 } from '../../../foundation/address';
import { palletSubAccountId, palletSubAccountSeed } from '../palletAccount';
import { assertU32 } from '../staking/calls/callArgs';

/** The runtime's `PrivateStakingId`. */
export const PRIVATE_STAKING_PALLET_ID = 'orb/pstk';

const u32le = (n: number) => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, n, true);
    return bytes;
};

/**
 * `m_P` of `poolId` as 0x-prefixed AccountId32 hex. `palletId` defaults to the runtime's
 * `PrivateStakingId`; pass the `PrivateStaking.PrivateStakingId` constant to follow it.
 */
export function privateMemberAccountId(
    poolId: number,
    palletId: string | Uint8Array = PRIVATE_STAKING_PALLET_ID
): string {
    assertU32(poolId, 'privateStaking.poolId');
    return palletSubAccountId(palletId, u32le(poolId));
}

/** `m_P` of `poolId` in SS58. */
export function privateMemberAddress(
    poolId: number,
    palletId: string | Uint8Array = PRIVATE_STAKING_PALLET_ID
): string {
    return accountIdHexToSs58(privateMemberAccountId(poolId, palletId))!;
}

/**
 * The pool whose private member `account` (SS58 or AccountId32 hex) is, or null for any
 * other account. Pool ids start at 1: the seedless account is the pallet's own.
 */
export function privateMemberPoolId(
    account: string | null | undefined,
    palletId: string | Uint8Array = PRIVATE_STAKING_PALLET_ID
): number | null {
    if (!account) return null;
    const seed = palletSubAccountSeed(palletId, account, 4);
    if (!seed) return null;
    const poolId = new DataView(seed.buffer, seed.byteOffset).getUint32(0, true);
    return poolId > 0 ? poolId : null;
}
