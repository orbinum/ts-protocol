/** A private call's outcome, as `PrivateCall.Executed` reports it in the block that ran it. */
import type { EventRecord } from '../../substrate/types/index';
import { eventField, hash32, integerOf, plain } from '../events/index';

/** What a private call's `PrivateCall.Executed` reports. */
export interface PrivateCallOutcome {
    /** False when a step failed or too little came back: nothing the steps did remains. */
    success: boolean;
    gasUsed: bigint;
    /** ORB minted to the call's key (what came back, or the amount), or left with the executor. */
    value: bigint;
    /** The minted note, lowercase `0x` hex; null when nothing was minted. */
    commitment: string | null;
}

/** The first well-formed `PrivateCall.Executed` among `events`, or null. */
export function privateCallOutcome(events: readonly EventRecord[]): PrivateCallOutcome | null {
    for (const record of events) {
        const { section, method, data } = record.event ?? {};
        if (typeof section !== 'string' || section.toLowerCase() !== 'privatecall') continue;
        if (typeof method !== 'string' || method.toLowerCase() !== 'executed') continue;
        if (!data || typeof data !== 'object') continue;
        const d = data as unknown as Record<string, unknown>;
        const success = plain(eventField(d, 0, 'success'));
        const gasUsed = integerOf(eventField(d, 1, 'gas_used'));
        const value = integerOf(eventField(d, 2, 'value'));
        const rawCommitment = plain(eventField(d, 3, 'commitment'));
        if (typeof success !== 'boolean' || gasUsed === null || value === null) continue;
        const commitment = rawCommitment == null ? null : hash32(rawCommitment);
        if (rawCommitment != null && commitment === null) continue;
        return { success, gasUsed, value, commitment };
    }
    return null;
}
