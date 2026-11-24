/**
 * Reading a decoded event's fields as plain values. Events come from a node as PAPI
 * values, polkadot.js codecs or their JSON, by field name or by position.
 */
import { isHexOfLength } from '../../../foundation/encoding/hex';

/** A decoded field as plain data: codec values serialise through `toJSON`. */
export function plain(value: unknown): unknown {
    return value !== null && typeof value === 'object' && 'toJSON' in value
        ? (value as { toJSON(): unknown }).toJSON()
        : value;
}

/** A field of `data` by name, or by its position among the event's fields. */
export function eventField(data: Record<string, unknown>, index: number, name: string): unknown {
    if (name in data) return data[name];
    return Array.isArray(data) ? data[index] : data[String(index)];
}

/** A 32-byte hash (a commitment) as lowercase `0x` hex, or null. */
export function hash32(value: unknown): string | null {
    const raw = plain(value);
    if (typeof raw !== 'string' || !raw.startsWith('0x')) return null;
    const hex = raw.toLowerCase();
    return isHexOfLength(hex, 32) ? hex : null;
}

/** An integer field as a bigint (from a bigint, a number, or hex or decimal text), or null. */
export function integerOf(value: unknown): bigint | null {
    const raw = plain(value);
    if (typeof raw === 'bigint') return raw;
    if (typeof raw === 'number' && !Number.isSafeInteger(raw)) return null;
    if (typeof raw !== 'number' && typeof raw !== 'string') return null;
    try {
        return BigInt(raw);
    } catch {
        return null;
    }
}
