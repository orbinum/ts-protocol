/**
 * Call names from the runtime metadata the transaction is built against: the creator
 * receives it as `payload.context.metadata`, so naming a call needs no request to the
 * node, and the names are those of the runtime that will render the text.
 */
import { decAnyMetadata, unifyMetadata } from '@polkadot-api/substrate-bindings';
import type { UnifiedMetadata } from '@polkadot-api/substrate-bindings';
import type { CallName } from './summary';

/** The parts of the metadata a call name is read from. */
export type CallMetadata = Pick<UnifiedMetadata, 'pallets' | 'lookup'>;

/** The pallet at `call[0]` and its call variant at `call[1]`; `null` if either is unknown. */
export function callNameIn(metadata: CallMetadata, call: Uint8Array): CallName | null {
    const pallet = metadata.pallets.find((p) => p.index === call[0]);
    const calls = pallet?.calls && metadata.lookup[pallet.calls.type]?.def;
    if (!pallet || calls?.tag !== 'variant') return null;
    const variant = calls.value.find((v) => v.index === call[1]);
    return variant ? { pallet: pallet.name, call: variant.name } : null;
}

// Decoding the metadata is the expensive part, and one runtime signs many transactions.
let cached: { raw: string; metadata: CallMetadata } | undefined;

/** `callNameIn` over raw metadata (`0x`-hex, as `payload.context.metadata` carries it). */
export function callNameFrom(rawMetadata: string, call: Uint8Array): CallName | null {
    if (cached?.raw !== rawMetadata) {
        cached = { raw: rawMetadata, metadata: unifyMetadata(decAnyMetadata(rawMetadata)) };
    }
    return callNameIn(cached.metadata, call);
}
