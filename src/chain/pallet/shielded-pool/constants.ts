/**
 * Runtime parameters of `pallet-shielded-pool`.
 *
 * Consensus values, not preferences: the chain rejects an extrinsic that
 * disagrees with them. They live here because a wallet has no way to derive
 * them and no business choosing them — `planTransfer` and `planUnshield` take a
 * `fee`, and without this a host is left reverse-engineering the number from a
 * failed extrinsic.
 *
 * These are the current chain's values, which is what every caller needs today.
 * A chain that has moved on should pass its own.
 */

/**
 * Smallest fee a spend (`private_transfer` / `unshield`) may carry, in planck.
 *
 * Mirrors the runtime constant `ShieldedPool.MinSpendFee`, which moves only
 * with a runtime upgrade; `ShieldedPoolModule.minSpendFee()` reads the live
 * value. Below it the spend is rejected (`FeeTooLow`, or `Payment` at pool
 * admission).
 *
 * The fee comes out of the shielded note and is credited to the block author's
 * validator account, which is what lets a user with no public balance spend a
 * shielded note at all.
 *
 * A sender may pay more. The fee is a public argument of the spend, bound by
 * its proof.
 */
export const MIN_SPEND_FEE = 1_000_000_000_000_000n; // 0.001 ORB

/**
 * Inputs and outputs in one private transfer.
 *
 * The circuit is fixed at 2-in/2-out: a spend with one real input pads with a
 * dummy, and change is always the second output even when it is zero.
 */
export const TRANSFER_INPUTS = 2;
export const TRANSFER_OUTPUTS = 2;

/**
 * Asset id of the chain's native token.
 *
 * Zero is the runtime's reserved id, not a convention a wallet may pick. It
 * decides real behaviour: balances across different assets must never be summed,
 * and a note's asset is part of its commitment, so mistaking a token for the
 * native asset produces a total that means nothing.
 */
export const NATIVE_ASSET_ID = 0n;

/** Whether an asset id refers to the native token. */
export function isNativeAsset(assetId: bigint | number | string): boolean {
    // An unparseable id is not the native asset — treating it as one would fold
    // an unknown token into an ORB total. Strings are decimal or 0x-hex only:
    // `BigInt('')` and `BigInt(' 0 ')` both read as zero.
    if (typeof assetId === 'string' && !/^(\d+|0x[0-9a-f]+)$/i.test(assetId)) return false;
    try {
        return BigInt(assetId) === NATIVE_ASSET_ID;
    } catch {
        return false;
    }
}
