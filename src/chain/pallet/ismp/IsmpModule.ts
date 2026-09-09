import type { SubstrateClient } from '../../substrate/SubstrateClient';
import type { StateMachineId } from './events';

/**
 * Which chain, under which consensus client.
 *
 * Both halves are required by every height query: the same chain can be tracked under
 * more than one consensus client, so `state_id` alone does not identify a channel.
 */
export interface StateMachineQuery {
    /** e.g. `"KUSAMA-4009"` — Hyperbridge on Paseo. */
    stateId: StateMachineId;
    /** The 4-character consensus state id, e.g. `"PAS0"`. */
    consensusStateId: string;
}

/** A dispatched POST request, as `ismp_queryRequests` returns it. */
export interface PostRequest {
    source: StateMachineId;
    dest: StateMachineId;
    nonce: number;
    /** Originating module id, 0x-prefixed. */
    from: string;
    /** Destination module id, 0x-prefixed. */
    to: string;
    /** Absolute unix seconds, or 0 for "never expires". */
    timeoutTimestamp: number;
    /** Opaque payload, 0x-prefixed. */
    body: string;
}

/** A dispatched GET request. */
export interface GetRequest {
    source: StateMachineId;
    dest: StateMachineId;
    nonce: number;
    from: string;
    /** Storage keys being read, 0x-prefixed. */
    keys: string[];
    /** The height on `dest` to read at. */
    height: number;
    context: string;
    timeoutTimestamp: number;
}

/**
 * A request as the RPC returns it — wrapped in its variant, not flattened.
 *
 * Verified against a live node: the response is `[{ "Post": { … } }]`, so a consumer that
 * reads `result[0].source` gets `undefined`. Narrow on the key first.
 */
export type IsmpRequest = { Post: PostRequest } | { Get: GetRequest };

/**
 * The health of one channel.
 *
 * `latestHeight` is the counterparty height this chain has accepted a proof for. It
 * climbing is the bridge working; frozen is the only symptom of a stalled relayer.
 */
export interface ChannelHeight {
    stateId: StateMachineId;
    consensusStateId: string;
    latestHeight: bigint;
}

/**
 * Typed client for the `ismp_*` JSON-RPC endpoints.
 *
 * Read-only. Dispatching a message is an extrinsic (`ismpMessaging.dispatch_post`), and
 * on this chain it is root-only, so it is deliberately not exposed here.
 *
 * A note on failure: these RPCs answer with error code 9876 rather than an empty result
 * when the state they read is absent — an unknown channel, or a consensus client that was
 * never installed. That is indistinguishable from a transport failure at the JSON-RPC
 * layer, so the methods below that can legitimately find nothing return `null` instead of
 * throwing, and say so.
 */
export class IsmpModule {
    constructor(private readonly substrate: SubstrateClient) {}

    /**
     * The latest counterparty height this chain has proven, or `null` if the channel is
     * unknown to it.
     *
     * `null` means one of two things and the RPC does not distinguish them: no consensus
     * client for that state machine, or one installed but not yet advanced. Both answer
     * "this channel is not usable yet".
     */
    async latestHeight(query: StateMachineQuery): Promise<bigint | null> {
        try {
            const raw = await this.substrate.request<number | string>(
                'ismp_queryStateMachineLatestHeight',
                [{ state_id: query.stateId, consensus_state_id: query.consensusStateId }]
            );
            return BigInt(raw);
        } catch {
            return null;
        }
    }

    /**
     * The challenge period for a channel in seconds, or `null` if unknown.
     *
     * Zero is a real answer, not an absence — Hyperbridge's economic security comes from
     * its relay chain, so a zero period is what the solochain integration prescribes.
     */
    async challengePeriod(query: StateMachineQuery): Promise<bigint | null> {
        try {
            const raw = await this.substrate.request<number | string>('ismp_queryChallengePeriod', [
                { state_id: query.stateId, consensus_state_id: query.consensusStateId },
            ]);
            return BigInt(raw);
        } catch {
            return null;
        }
    }

    /**
     * Looks up dispatched requests by commitment.
     *
     * Takes `Vec<LeafIndexQuery>`, so a bare hash is rejected — the argument is wrapped
     * per commitment. Returns only the ones found, so a shorter array than asked for is
     * not an error.
     */
    async requests(commitments: string[]): Promise<IsmpRequest[]> {
        if (commitments.length === 0) return [];
        return this.substrate.request<IsmpRequest[]>('ismp_queryRequests', [
            commitments.map((commitment) => ({ commitment })),
        ]);
    }

    /**
     * Looks up responses by commitment. Same wrapping as `requests`.
     */
    async responses(commitments: string[]): Promise<unknown[]> {
        if (commitments.length === 0) return [];
        return this.substrate.request<unknown[]>('ismp_queryResponses', [
            commitments.map((commitment) => ({ commitment })),
        ]);
    }

    /**
     * ISMP events in a block range, keyed by block hash.
     *
     * The shape is a map, not an array — verified against a live node. Blocks with no ISMP
     * activity are present with an empty array rather than omitted, so the keys describe
     * the range that was scanned and not the blocks that matched.
     */
    async events(from: number, to: number): Promise<Record<string, unknown[]>> {
        return this.substrate.request<Record<string, unknown[]>>('ismp_queryEvents', [from, to]);
    }

    /**
     * Convenience: is this channel alive, and how far along?
     *
     * A `null` height is reported rather than thrown, because "not onboarded yet" is a
     * normal state during setup and not a failure to handle.
     */
    async channelHeight(query: StateMachineQuery): Promise<ChannelHeight | null> {
        const latestHeight = await this.latestHeight(query);
        if (latestHeight === null) return null;
        return {
            stateId: query.stateId,
            consensusStateId: query.consensusStateId,
            latestHeight,
        };
    }
}
