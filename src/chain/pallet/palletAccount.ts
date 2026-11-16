/**
 * A pallet's keyless sub-account, as `PalletId::into_sub_account_truncating(seed)`:
 * `"modl" ‖ pallet_id (8 bytes) ‖ SCALE(seed)`, zero-padded to 32 bytes.
 */
import { accountIdHexToSs58, addressToAccountIdHex } from '../../foundation/address';
import { fromHex, toHex } from '../../foundation/encoding/hex';

const MODL = new TextEncoder().encode('modl');

/** The 8 bytes of a `PalletId`, from its ASCII (`"orb/pool"`) or its bytes. */
function palletIdBytes(palletId: string | Uint8Array): Uint8Array {
    const bytes = typeof palletId === 'string' ? new TextEncoder().encode(palletId) : palletId;
    if (bytes.length !== 8) throw new Error('PalletId: expected 8 bytes');
    return bytes;
}

/** The sub-account of `palletId` for the SCALE-encoded `seed`, as AccountId32 hex. */
export function palletSubAccountId(palletId: string | Uint8Array, seed: Uint8Array): string {
    if (seed.length > 20) throw new Error('palletSubAccountId: seed longer than 20 bytes');
    const bytes = new Uint8Array(32);
    bytes.set(MODL, 0);
    bytes.set(palletIdBytes(palletId), 4);
    bytes.set(seed, 12);
    return toHex(bytes);
}

/** The pallet's own account, as `PalletId::into_account_truncating`: no seed. */
export function palletAccountId(palletId: string | Uint8Array): string {
    return palletSubAccountId(palletId, new Uint8Array());
}

/**
 * The seed bytes of `account` (SS58 or AccountId32 hex) if it is a sub-account of
 * `palletId` whose seed is `seedLength` bytes, else null.
 */
export function palletSubAccountSeed(
    palletId: string | Uint8Array,
    account: string,
    seedLength: number
): Uint8Array | null {
    const hex = addressToAccountIdHex(account);
    if (!hex) return null;
    const bytes = fromHex(hex);
    const id = palletIdBytes(palletId);
    if (bytes.length !== 32) return null;
    if (!MODL.every((b, i) => bytes[i] === b) || !id.every((b, i) => bytes[4 + i] === b)) {
        return null;
    }
    if (bytes.subarray(12 + seedLength).some((b) => b !== 0)) return null;
    return bytes.slice(12, 12 + seedLength);
}

/**
 * Every `PalletId` the runtime declares, by what it is (`configs/**`, `economy/accounts.rs`).
 * A pallet's own account is `palletAccountId(id)`.
 */
export const ORBINUM_PALLET_IDS = {
    shieldedPool: 'shld/pol',
    ismpTreasury: 'orb/ismp',
    ismpMessaging: 'orb/msgs',
    governance: 'py/trsry',
    eraFeePool: 'orb/feep',
    autoPayout: 'orb/apay',
    eraPruning: 'orb/prun',
    stakingPot: 'orb/stpt',
    nominationPools: 'orb/pool',
    delegatedStaking: 'orb/dlst',
    privateStaking: 'orb/pstk',
} as const;

/** The shielded pool's account: it holds every shielded balance. */
export const SHIELDED_POOL_ACCOUNT = accountIdHexToSs58(
    palletAccountId(ORBINUM_PALLET_IDS.shieldedPool)
) as string;

/** The ISMP treasury account: relayer fees collect here. */
export const ISMP_TREASURY_ACCOUNT = accountIdHexToSs58(
    palletAccountId(ORBINUM_PALLET_IDS.ismpTreasury)
) as string;
