/**
 * Decoded `System.Events` entries, as the `EventRecord` shape consumers read:
 * a section/method pair, the extrinsic it belongs to, and a `data` view that
 * stringifies the way polkadot.js codecs did.
 */
import { toHex } from '../../foundation/encoding/hex';
import type { EventRecord } from './types';

/** `EventRecord`s from the decoded `System.Events` storage; an entry that does not fit is skipped. */
export function toEventRecords(decoded: unknown[]): EventRecord[] {
    return decoded.flatMap((e) => {
        try {
            const raw = e as {
                phase: { type: string; value?: number };
                event: { type: string; value: { type: string; value: unknown } };
            };
            const isApply = raw.phase.type === 'ApplyExtrinsic';
            const extIdx = isApply ? (raw.phase.value as number) : 0;
            const section = raw.event.type.charAt(0).toLowerCase() + raw.event.type.slice(1);
            const method = raw.event.value.type;

            const record: EventRecord = {
                phase: {
                    isApplyExtrinsic: isApply,
                    asApplyExtrinsic: {
                        eq: (n: number) => n === extIdx,
                        toString: () => String(extIdx),
                        toNumber: () => extIdx,
                    },
                },
                event: {
                    section,
                    method,
                    data: buildDataProxy(raw.event.value.value),
                },
            };
            return [record];
        } catch {
            return [];
        }
    });
}

/** A `data` view over an event payload: indexable, with `toString` / `toJSON` / `toHuman`. */
export function buildDataProxy(value: unknown): EventRecord['event']['data'] {
    const formatValue = (v: unknown): string => {
        if (v instanceof Uint8Array) return toHex(v);
        if (typeof v === 'bigint') return v.toString();
        return String(v);
    };
    const jsonifyValue = (v: unknown): unknown => {
        if (v === null || v === undefined) return v;
        if (typeof v === 'bigint') return v.toString();
        if (v instanceof Uint8Array) return toHex(v);
        if (Array.isArray(v)) return v.map(jsonifyValue);
        if (typeof v === 'object') {
            const obj = v as Record<string, unknown>;
            // Handle polkadot-api Binary type and similar objects with asHex()
            if (typeof obj['asHex'] === 'function') {
                try {
                    return (obj['asHex'] as () => string)();
                } catch {
                    /* fall through to generic handling */
                }
            }
            return Object.fromEntries(
                Object.entries(obj)
                    .filter(([, val]) => typeof val !== 'function')
                    .map(([k, val]) => [k, jsonifyValue(val)])
            );
        }
        return v;
    };

    const entries: unknown[] = Array.isArray(value)
        ? value
        : value !== null && typeof value === 'object'
          ? Object.values(value as object)
          : [value];

    const items = entries.map((v) => ({
        toString: () => formatValue(v),
        toJSON: () => jsonifyValue(v),
        toHuman: () => jsonifyValue(v),
        ...(v !== null && typeof v === 'object' ? (v as object) : {}),
    }));

    return Object.assign(items as unknown as EventRecord['event']['data'], {
        toJSON: () => jsonifyValue(value),
        toHuman: () => jsonifyValue(value),
    });
}
