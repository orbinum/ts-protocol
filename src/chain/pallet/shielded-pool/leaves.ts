/**
 * Where a block's shielded-pool events put commitments in the tree.
 *
 * Every insertion names its leaf: `Shielded` (a deposit), `CommitmentsInserted` (a
 * transfer's outputs), `Unshielded` and `BoundSpent` (a spend's change) and
 * `NoteMinted` (a note the chain computed for a bound action). A wallet keeps its own
 * notes' leaves from these; an indexer or explorer reads the same insertions.
 *
 * The events come from a node and are trusted no further than a leaf index: a wrong
 * one fails a check against the node's root before any path is built from it.
 */
import { isValidLeafIndex } from '../../../protocol/spend/index';
import { mapZkEventData } from '../../substrate/extrinsic/index';
import type { EventRecord } from '../../substrate/types/index';
import { hash32, integerOf, plain } from '../events/index';

function leafIndexOf(value: unknown): number | null {
    const raw = plain(value);
    const n = typeof raw === 'bigint' ? Number(raw) : typeof raw === 'string' ? Number(raw) : raw;
    return typeof n === 'number' && isValidLeafIndex(n) ? n : null;
}

/** A note the chain minted itself (`NoteMinted`), as plain data. */
export interface MintedLeaf {
    /** The commitment, lowercase `0x` hex. */
    commitment: string;
    assetId: number;
    value: bigint;
    leafIndex: number;
}

/** Every note the shielded-pool events mint (`NoteMinted`); a malformed one is skipped. */
export function mintedLeaves(events: readonly EventRecord[]): MintedLeaf[] {
    const minted: MintedLeaf[] = [];
    for (const record of events) {
        const { section, method, data } = record.event ?? {};
        if (typeof section !== 'string' || section.toLowerCase() !== 'shieldedpool') continue;
        if (typeof method !== 'string' || method.toLowerCase() !== 'noteminted') continue;
        if (!data || typeof data !== 'object') continue;
        const mapped = mapZkEventData(method, data as unknown as Record<string, unknown>, section);
        const commitment = hash32(mapped['commitment']);
        const leafIndex = leafIndexOf(mapped['index']);
        const assetId = integerOf(mapped['asset_id']);
        const value = integerOf(mapped['value']);
        if (commitment === null || leafIndex === null || assetId === null || value === null) {
            continue;
        }
        if (assetId < 0n || assetId > 0xffff_ffffn || value < 0n) continue;
        minted.push({ commitment, assetId: Number(assetId), value, leafIndex });
    }
    return minted;
}

/** Every commitment the shielded-pool events insert, by lowercase hex, with its leaf. */
export function insertedLeaves(events: readonly EventRecord[]): Map<string, number> {
    const leaves = new Map<string, number>();
    const put = (commitment: unknown, leaf: unknown) => {
        const key = hash32(commitment);
        const at = leafIndexOf(leaf);
        if (key !== null && at !== null && !leaves.has(key)) leaves.set(key, at);
    };
    for (const record of events) {
        const { section, method, data } = record.event ?? {};
        if (typeof section !== 'string' || section.toLowerCase() !== 'shieldedpool') continue;
        if (!data || typeof data !== 'object') continue;
        const mapped = mapZkEventData(method, data as unknown as Record<string, unknown>, section);
        switch (method.toLowerCase()) {
            case 'shielded':
            case 'noteminted':
                put(mapped['commitment'], mapped['index']);
                break;
            case 'commitmentsinserted': {
                const commitments = plain(mapped['commitments']);
                const indices = plain(mapped['indices']);
                if (!Array.isArray(commitments) || !Array.isArray(indices)) break;
                // Paired by position, as the pallet emits them.
                commitments.forEach((c, i) => put(c, indices[i]));
                break;
            }
            case 'unshielded':
            case 'boundspent':
                put(mapped['change_commitment'], mapped['change_index']);
                break;
        }
    }
    return leaves;
}
