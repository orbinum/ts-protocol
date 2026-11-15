/**
 * A pallet's keyless sub-account, as `PalletId::into_sub_account_truncating(seed)`:
 * `"modl" ‖ pallet_id (8 bytes) ‖ SCALE(seed)`, zero-padded to 32 bytes.
 */
import { addressToAccountIdHex } from '../../foundation/address';
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
