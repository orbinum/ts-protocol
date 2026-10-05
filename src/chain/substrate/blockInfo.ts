/**
 * Block fields read straight from raw block bytes: the block time when the
 * `Timestamp.Now` storage read is unavailable, and the author from the digest.
 */
import { AccountId } from '@polkadot-api/substrate-bindings';
import { fromHex, toHex } from '../../foundation/encoding/hex';

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
 * Extracts the block author (validator/collator) from raw digest log hex strings.
 * Looks for a PreRuntime log (tag byte = 6) and decodes the first 32 bytes of the
 * SCALE-compact payload as an SS58 address using the given prefix.
 *
 * Can be used standalone with raw logs from `chain_getBlock` responses.
 */
export function extractAuthorFromLogs(logs: string[], ss58Prefix: number): string | null {
    try {
        for (const hex of logs) {
            const bytes = fromHex(hex as `0x${string}`);
            if (bytes.length < 6 || bytes[0] !== 6) continue; // 6 = PreRuntime
            const firstLenByte = bytes[5] as number;
            const mode = firstLenByte & 0b11;
            let payloadStart: number;
            let payloadLen: number;
            if (mode === 0) {
                payloadLen = firstLenByte >> 2;
                payloadStart = 6;
            } else if (mode === 1) {
                if (bytes.length < 7) continue;
                payloadLen = (firstLenByte >> 2) | ((bytes[6] as number) << 6);
                payloadStart = 7;
            } else if (mode === 2) {
                if (bytes.length < 9) continue;
                payloadLen =
                    ((firstLenByte >> 2) |
                        ((bytes[6] as number) << 6) |
                        ((bytes[7] as number) << 14) |
                        ((bytes[8] as number) << 22)) >>>
                    0;
                payloadStart = 9;
            } else {
                continue;
            }
            const payload = bytes.slice(payloadStart, payloadStart + payloadLen);
            if (payload.length >= 32) {
                try {
                    return AccountId(ss58Prefix).dec(payload.slice(0, 32));
                } catch {
                    return toHex(payload.slice(0, 32));
                }
            }
        }
    } catch {
        /* digest may be empty or malformed */
    }
    return null;
}
