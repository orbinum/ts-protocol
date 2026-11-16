/**
 * The runtime's event vocabulary: every event's field names, generated from the
 * metadata (`scripts/gen-event-fields.mjs`). A consumer that reads a field by name
 * types it against these, so a field the runtime renames fails to compile instead of
 * reading as absent.
 */
import { EVENT_FIELDS } from './eventFields.generated';

export { EVENT_FIELDS, EVENT_FIELDS_SPEC } from './eventFields.generated';

type Fields = typeof EVENT_FIELDS;

/** A pallet that declares events. */
export type RuntimePallet = keyof Fields;

/** An event of pallet `P`. */
export type RuntimeEvent<P extends RuntimePallet> = keyof Fields[P] & string;

/** A field of event `E` of pallet `P`. */
export type EventFieldName<
    P extends RuntimePallet,
    E extends RuntimeEvent<P>,
> = Fields[P][E] extends readonly (infer F)[] ? F & string : never;

/**
 * Event `E`'s data by field name. Values are `unknown`: a decoder gives bigint and
 * `Binary`, an indexer gives JSON, so each consumer reads its own representation.
 */
export type EventFields<P extends RuntimePallet, E extends RuntimeEvent<P>> = {
    readonly [K in EventFieldName<P, E>]?: unknown;
};

/** The field names of `event` of `pallet`, or undefined for an event the runtime does not declare. */
export function eventFieldNames(pallet: string, event: string): readonly string[] | undefined {
    const events = (EVENT_FIELDS as Record<string, Record<string, readonly string[]>>)[pallet];
    return events?.[event];
}
