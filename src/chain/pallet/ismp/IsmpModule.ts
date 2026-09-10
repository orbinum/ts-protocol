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

/**
 * A dispatched POST request, as `ismp_queryRequests` returns it.
 *
 * The u64 fields are `bigint`: the chain declares them u64, and `number` silently loses
 * precision past 2^53. The RPC hands them over as JSON numbers today, so a caller reading
 * raw JSON must widen them — `BigInt(raw.nonce)` — before hashing, or the commitment will
 * not reproduce.
 */
export interface PostRequest {
    source: StateMachineId;
    dest: StateMachineId;
    nonce: bigint;
    /** Originating module id, 0x-prefixed. */
    from: string;
    /** Destination module id, 0x-prefixed. */
    to: string;
    /** Absolute unix seconds, or `0n` for "never expires" — see `TimeoutTimestamp`. */
    timeoutTimestamp: bigint;
    /** Opaque payload, 0x-prefixed. */
    body: string;
}

/** A dispatched GET request. Same `bigint` reasoning as `PostRequest`. */
export interface GetRequest {
    source: StateMachineId;
    dest: StateMachineId;
    nonce: bigint;
    /**
     * Our own module id, 0x-prefixed — a GET addresses storage, not a module, so this is
     * where the answer is routed back to rather than a recipient.
     */
    from: string;
    /**
     * Storage keys being read, 0x-prefixed.
     *
     * Against Hyperbridge these must be keys of its ISMP **child trie**, not its global
     * state — see `HYPERBRIDGE_CHILD_TRIE`.
     */
    keys: string[];
    /**
     * The height on `dest` to read at.
     *
     * Must be a height the source chain can already prove: the response handler compares
     * it for EQUALITY, not as a lower bound, so a height nobody holds a commitment for is
     * not a slow request — it is one that can never be answered.
     */
    height: bigint;
    /** Application metadata, echoed back on the response. Usually `'0x'`. */
    context: string;
    timeoutTimestamp: bigint;
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
 * The ISMP child trie prefix, identical on every `pallet-ismp` chain.
 *
 * **What of Hyperbridge is readable: this trie, not its global state.** For the
 * coprocessor, `ismp-grandpa` records `state_root = ismp_digest.child_trie_root` and
 * `overlay_root = mmr_root` (`ismp-grandpa-2606.0.0/src/consensus.rs:142-150`, "for the
 * coprocessor, we only care about the child root & mmr root") — verified live: a stored
 * commitment equals Hyperbridge's `ismp.childTrieRoot` at that height, not its header's
 * `state_root`.
 *
 * So a GET against Hyperbridge can only prove keys inside this trie, and a GET for a
 * global key such as `Ismp::Nonce` is unverifiable by construction: the proof would be
 * for a trie the source chain holds no root of. This holds for any relayer, not only a
 * self-relaying one.
 */
export const ISMP_CHILD_TRIE = `0x${Buffer.from(':child_storage:default:ISMPv2').toString('hex')}`;

/** Child-trie key of a request commitment: `"RequestCommitments" ++ commitment`. */
export function commitmentKey(commitment: string): string {
    return `0x${Buffer.from('RequestCommitments').toString('hex')}${commitment.slice(2)}`;
}

/**
 * Child-trie key of a delivery receipt: `"RequestReceipts" ++ commitment`.
 *
 * Present means the destination accepted the request. **Absent does not mean in
 * transit**: the handler stores the receipt BEFORE the module callback and deletes it if
 * the callback errs (`modules/ismp/core/src/handlers/request.rs:112-125`), so a refused
 * message and one still in flight look identical from outside.
 */
export function receiptKey(commitment: string): string {
    return `0x${Buffer.from('RequestReceipts').toString('hex')}${commitment.slice(2)}`;
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
     * Trie nodes proving `keys` in the ISMP child trie at `height`.
     *
     * This is the RPC Tesseract itself uses for state proofs
     * (`tesseract/messaging/substrate/src/provider.rs:314-325`); public nodes generally do
     * not expose `childstate_getChildReadProof`.
     *
     * Two encoding details, both of which cost real debugging time:
     *
     *   - the keys go over the wire as **arrays of bytes**, not hex strings — a hex string
     *     is rejected with "invalid type: string, expected struct";
     *   - the response's `proof` is a `Vec<u8>` (a JSON array of numbers) that CONTAINS a
     *     SCALE-encoded `Vec<Vec<u8>>`. Handing that array straight to a `Vec<Bytes>`
     *     decoder yields one bogus "node" per byte — a 1462-node proof that hashes to
     *     nothing. The raw bytes are returned here; decode them with SCALE, not per-element.
     *
     * Returns `null` when the node has no state at that height (pruned, or not synced that
     * far), which is a normal answer rather than a failure.
     */
    async childTrieProof(height: number, keys: string[]): Promise<Uint8Array | null> {
        const asBytes = keys.map((k) => Array.from(Buffer.from(k.slice(2), 'hex')));
        try {
            const res = await this.substrate.request<{ proof: number[] | string }>(
                'ismp_queryChildTrieProof',
                [height, asBytes]
            );
            return typeof res.proof === 'string'
                ? Uint8Array.from(Buffer.from(res.proof.slice(2), 'hex'))
                : Uint8Array.from(res.proof);
        } catch {
            return null;
        }
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
