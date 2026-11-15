/**
 * A nomination pool's keyless accounts, as the pools pallet derives them:
 * `PalletId::into_sub_account_truncating((AccountType, pool_id))`, `AccountType` one byte
 * (bonded 0, reward 1) and the pool id a little-endian u32. `palletId` defaults to the
 * runtime's `PoolsPalletId`; pass the `NominationPools.PalletId` constant to follow it.
 */
import { accountIdHexToSs58 } from '../../../foundation/address';
import { palletSubAccountId, palletSubAccountSeed } from '../palletAccount';
import { assertU32 } from '../staking/calls/callArgs';

/** The runtime's `PoolsPalletId`. */
export const POOLS_PALLET_ID = 'orb/pool';

const seed = (type: 0 | 1, poolId: number) => {
    assertU32(poolId, 'pools.poolId');
    const bytes = new Uint8Array(5);
    bytes[0] = type;
    new DataView(bytes.buffer).setUint32(1, poolId, true);
    return bytes;
};

/** Pool `poolId`'s bonded and reward accounts, in SS58. */
export function poolAccounts(
    poolId: number,
    palletId: string | Uint8Array = POOLS_PALLET_ID
): { bonded: string; reward: string } {
    return {
        bonded: accountIdHexToSs58(palletSubAccountId(palletId, seed(0, poolId)))!,
        reward: accountIdHexToSs58(palletSubAccountId(palletId, seed(1, poolId)))!,
    };
}

/** The pool whose bonded account `account` is, or null for any other account. */
export function poolOfBondedAccount(
    account: string,
    palletId: string | Uint8Array = POOLS_PALLET_ID
): number | null {
    const bytes = palletSubAccountSeed(palletId, account, 5);
    if (!bytes || bytes[0] !== 0) return null;
    return new DataView(bytes.buffer, bytes.byteOffset).getUint32(1, true);
}
