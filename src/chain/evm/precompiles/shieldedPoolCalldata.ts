/**
 * Calldata for the shielded-pool precompile: params in, ABI-encoded hex out.
 * The precompile's only call is `shield`.
 *
 * Kept apart from `ShieldedPoolPrecompile` because building calldata needs no
 * chain connection — it is a pure function of the params. The class owns the
 * transport (signer, gas estimation, the precompile address); this owns the
 * bytes.
 *
 * ## Validation lives here
 *
 * The ABI encoder is total: it left-pads whatever it is handed into a 32-byte
 * word. That makes silent corruption the default failure mode — an empty
 * string becomes 32 zero bytes, and a number past 2^32 becomes a word the node
 * reads back truncated. Both produce calldata the chain rejects for reasons the
 * user cannot act on, so every value is refused HERE, at the last point where
 * the field name is still known and can go in the error message.
 */
import type { ShieldParams } from '../../pallet/shielded-pool/types/index';
import { assertShieldParams } from '../../pallet/shielded-pool/calls/index';
import { fromHex, isHexOfLength } from '../../../foundation/encoding/hex';
import { encodeHex } from './abi';
import { SP_SEL } from './addresses';

// ─── Field guards ────────────────────────────────────────────────────────────

/**
 * A `bytes32` ABI slot, from exactly 32 bytes.
 *
 * Throws rather than returning null, unlike the boundary checks in `protocol/`:
 * this is the wallet's own outgoing calldata, so a bad value is a bug in the
 * caller, not hostile input to tolerate.
 */
function bytes32(hex: string, field: string): Uint8Array {
    if (!isHexOfLength(hex, 32)) {
        throw new Error(`${field}: expected a 0x-prefixed 32-byte hex string, got ${hex}`);
    }
    return fromHex(hex);
}

/**
 * A `uint32` ABI slot, checked against the width the chain actually decodes.
 *
 * The slot is 32 bytes wide, so an oversized value encodes cleanly and is then
 * truncated on the far side: `2^32` reads back as `0`. For `circuitVersion`
 * that silently selects a DIFFERENT verifying key than the caller asked for.
 */
function uint32(value: number, field: string): bigint {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
        throw new Error(`${field}: expected a uint32 (0..4294967295), got ${value}`);
    }
    return BigInt(value);
}

// ─── Builders ────────────────────────────────────────────────────────────────

/**
 * Calldata for `shield(uint32, bytes32, bytes, bytes, uint32)`.
 *
 * The token amount is NOT here: it rides as `msg.value` on the transaction, so
 * EVM wallets show the user the amount they are actually sending. The proof
 * binds the commitment to that amount.
 */
export function buildShieldCalldata(params: ShieldParams): string {
    assertShieldParams(params, 'buildShieldCalldata');
    const commitment = bytes32(params.commitment, 'buildShieldCalldata.commitment');

    return encodeHex(
        SP_SEL.SHIELD,
        { type: 'uint', value: uint32(params.assetId, 'buildShieldCalldata.assetId') },
        { type: 'bytes32', value: commitment },
        { type: 'bytes', value: params.encryptedMemo },
        { type: 'bytes', value: params.proof },
        { type: 'uint', value: uint32(params.circuitVersion, 'buildShieldCalldata.circuitVersion') }
    );
}
