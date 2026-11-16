/**
 * Block fields read straight from raw block bytes: the block time when the
 * `Timestamp.Now` storage read is unavailable, and the Aura slot the author follows from.
 */
import { fromHex } from '../../foundation/encoding/hex';

/**
 * `pallet_timestamp`'s index in the runtime's `construct_runtime!`.
 *
 * Only used by the block-time fallback, which is a heuristic on raw extrinsic
 * bytes rather than a decode. A runtime that reorders its pallets makes the
 * fallback stop matching — it degrades to no timestamp, never a wrong one.
 */
const TIMESTAMP_PALLET = 0x01;

/**
 * SCALE compact integer at `offset`, or null when the bytes run out.
 *
 * Two low bits give the mode: 0 → one byte, 1 → two, 2 → four, 3 → a
 * length-prefixed big integer. Reading a compact as a raw little-endian word
 * yields a plausible wrong number rather than an error, which is why this is
 * spelled out rather than approximated.
 */
function decodeCompact(bytes: Uint8Array, offset: number): number | null {
    const first = bytes[offset];
    if (first === undefined) return null;
    const mode = first & 0b11;
    if (mode === 0) return first >>> 2;
    if (mode === 1) {
        const b1 = bytes[offset + 1];
        return b1 === undefined ? null : ((first >>> 2) | (b1 << 6)) >>> 0;
    }
    const width = mode === 2 ? 4 : (first >>> 2) + 5;
    if (offset + width > bytes.length) return null;
    let value = 0n;
    const start = mode === 2 ? offset : offset + 1;
    const end = mode === 2 ? offset + 4 : offset + width;
    for (let i = end - 1; i >= start; i--) value = (value << 8n) | BigInt(bytes[i] as number);
    if (mode === 2) value >>= 2n;
    // Milliseconds since the epoch stay far inside a double; anything larger is
    // not a block time.
    return value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value);
}

/**
 * The block time, read out of the `timestamp.set` call, or null.
 *
 * An unsigned extrinsic is `Compact(len) || version || pallet || call || args`,
 * so for this one — under 64 bytes, hence a 1-byte compact prefix — the pallet
 * index sits at b[2] and the call at b[3]. The argument is a COMPACT u64, not a
 * raw one.
 */
export function timestampFromExtrinsics(extrinsics: string[]): number | null {
    for (const hex of extrinsics) {
        try {
            const b = fromHex(hex as `0x${string}`);
            if (b.length < 5 || b[2] !== TIMESTAMP_PALLET || b[3] !== 0x00) continue;
            const ts = decodeCompact(b, 4);
            if (ts !== null) return ts > 0 ? ts : null;
        } catch {
            /* not this one */
        }
    }
    return null;
}

/**
 * The slot of a block, from its Aura `PreRuntime` digest (`06 ‖ "aura" ‖ compact(8) ‖
 * u64 LE`), or null when absent (the genesis block was not authored).
 *
 * Aura carries ONLY the slot: the author is not in the header (unlike Babe, whose
 * digest names the authority), so it is `authorFromSlot(slot, validators)`.
 */
export function auraSlot(logs: string[]): bigint | null {
    for (const log of logs) {
        const hex = (log.startsWith('0x') ? log.slice(2) : log).toLowerCase();
        // 06 PreRuntime, 61757261 "aura", 20 compact length 8.
        if (!hex.startsWith('066175726120') || hex.length < 28) continue;
        const le = hex.slice(12, 28).match(/../g)!;
        return BigInt('0x' + le.toReversed().join(''));
    }
    return null;
}

/**
 * The validator that authored `slot`: Aura assigns slots round-robin over the session's
 * validator set (`Session.Validators`, ordered as `Aura.Authorities`). Null when the
 * slot or the set is unknown: never a wrong attribution.
 */
export function authorFromSlot(slot: bigint | null, validators: readonly string[]): string | null {
    if (slot === null || validators.length === 0) return null;
    return validators[Number(slot % BigInt(validators.length))] ?? null;
}
