/** Reading a bound action's fields back from a decoder: PAPI values, or their JSON. */
import { fromHex, isHexOfLength } from '../../../foundation/encoding/hex';

/** Bytes from a decoded field: hex, bytes, or PAPI's `Binary`/`FixedSizeBinary`; null otherwise. */
export function readBytes(v: unknown, length?: number): Uint8Array | null {
    const fits = (b: Uint8Array) => (length === undefined || b.length === length ? b : null);
    if (v instanceof Uint8Array) return fits(v);
    if (typeof v === 'string') {
        if (length !== undefined) return isHexOfLength(v, length) ? fromHex(v) : null;
        return /^0x([0-9a-fA-F]{2})*$/.test(v) ? fromHex(v) : null;
    }
    const asBytes = (v as { asBytes?: () => Uint8Array } | null)?.asBytes;
    return typeof asBytes === 'function' ? readBytes(asBytes.call(v), length) : null;
}

/** An amount from a decoded field: a bigint, a safe integer or decimal text; null otherwise. */
export function readAmount(v: unknown): bigint | null {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number' && Number.isSafeInteger(v)) return BigInt(v);
    return typeof v === 'string' && /^\d+$/.test(v) ? BigInt(v) : null;
}

/** A decoded enum value (`{ type, value }`), or null. */
export function readVariant(v: unknown): { type: string; value?: unknown } | null {
    return v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string'
        ? (v as { type: string; value?: unknown })
        : null;
}

/** A decoded struct's fields by name; empty for anything else. */
export const readStruct = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
