/**
 * TypeScript types for events emitted by pallet-ismp-messaging and pallet-ismp.
 *
 * Conventions:
 *   - H256 / byte arrays (commitment, module ids)  → `string`  (0x-prefixed hex)
 *   - u64 (nonces, heights)                        → `bigint`  (exceeds Number.MAX_SAFE_INTEGER)
 *   - u32 counters (body_len, keys, found)         → `number`
 *   - StateMachine                                 → `StateMachineId` (see below)
 *   - Balances                                     → `bigint`
 *
 * Two pallets in one file because they describe the same traffic from two sides:
 * `ismpMessaging` is ours (what a user dispatched, what arrived), `ismp` is the protocol
 * pallet underneath it (requests entering its commitment tree, counterparty finality).
 * A single dispatch emits one event from each.
 */

// ─── State machine identity ──────────────────────────────────────────────────

/**
 * A chain, as ISMP names it.
 *
 * The variant is part of the identity, not decoration: ISMP compares the whole SCALE
 * variant with `==`, so `Polkadot(4009)` and `Kusama(4009)` are different chains and must
 * never be collapsed to the para id alone.
 *
 * How it reaches you depends on the transport, and the two do not agree:
 *   - the `ismp_*` RPCs serialise it as a string — `"KUSAMA-1000"`, `"SUBSTRATE-orbi"`
 *   - decoded block events give the SCALE enum — `{ type: 'Kusama', value: 1000 }`
 *
 * Verified against a live node rather than inferred; a consumer that assumes one shape
 * silently reads `undefined` from the other.
 */
export type StateMachineId = string;

/**
 * The SCALE enum as a decoded block event carries it.
 *
 * `Relay` is the only struct-like variant, and both of its fields are the identity — the
 * same para id under a different relay is a different chain.
 */
export type StateMachineEnum =
    | { type: 'Evm'; value: number }
    | { type: 'Polkadot'; value: number }
    | { type: 'Kusama'; value: number }
    | { type: 'Substrate'; value: string }
    | { type: 'Tendermint'; value: string }
    | { type: 'Relay'; value: { relay: string; para_id: number } };

// ─── Shared field semantics ──────────────────────────────────────────────────

/**
 * Which kind of request an event describes.
 *
 * Carried by `RequestDispatched` (what went out) and `RequestTimedOut` (what expired),
 * both since runtime spec 13. The distinction is not cosmetic: a POST is handed to a
 * module on the destination, which may refuse it, while a GET addresses storage and has
 * no receiving module at all — so the two fail, and succeed, in different ways.
 */
export type RequestKind = 'Post' | 'Get';

/**
 * Absolute unix SECONDS at which a message expires, with **three** distinct states.
 * Conflating any two of them is a bug:
 *
 *   - `0n`         never expires. Upstream's explicit `if timeout == 0 { 0 }` branch
 *                  (`ismp-2606.1.0/src/dispatcher.rs:132`) — NOT "expired in 1970".
 *                  Rendering it as a date claims the message died decades ago.
 *   - `undefined`  unknown: the block predates runtime spec 13, which is when the
 *                  pallet started emitting it. Absence is a real answer here.
 *   - anything else  a genuine deadline.
 */
export type TimeoutTimestamp = bigint;

// ─── Outbound: dispatched from this chain ────────────────────────────────────

/**
 * Emitted by `dispatch_post()` or `dispatch_get()` when a request is accepted by the ISMP
 * dispatcher.
 * Rust variant: `RequestDispatched { dest, to, commitment, nonce, timeout_timestamp,
 * body_len, kind }`
 *
 * `dest` is the chain the message is ADDRESSED to, not the next hop — Hyperbridge is the
 * route, and the pallet consults the coprocessor on its own.
 *
 * Everything past `commitment` arrived in runtime spec 13. Together they make the event
 * self-sufficient: the request it describes can be rebuilt from these fields alone and
 * hashed back to `commitment` (see `requestCommitment` in `./commitment`), which is what
 * a relayer has to do to prove it.
 */
export type RequestDispatchedEvent = {
    /** Final recipient chain, not the coprocessor. */
    dest: StateMachineId;
    /**
     * Module id — 8, 20 or 32 bytes, 0x-prefixed. The length is the type.
     *
     * Whose module depends on `kind`, and getting this backwards names the wrong chain:
     * on a POST it is the DESTINATION's receiving module; on a GET there is no recipient,
     * so it carries OUR own module id — the address the answer is routed back to.
     */
    to: string;
    /** 0x-prefixed 32-byte commitment. How the request is looked up over RPC. */
    commitment: string;
    /**
     * The nonce this message went out with — read BEFORE the dispatcher consumed it, so
     * it names this request and not the next one. Matches the `ismp.Request` event from
     * the same call.
     */
    nonce: bigint;
    /** See `TimeoutTimestamp`: `0n` means never, not 1970. */
    timeoutTimestamp: TimeoutTimestamp;
    /** Payload size. Always `0` for a GET, which has no body. */
    bodyLen: number;
    kind: RequestKind;
};

/**
 * Emitted by the protocol pallet for the same dispatch.
 * Rust variant: `Request { dest_chain, source_chain, request_nonce, commitment }`
 *
 * Carries the nonce and source that `RequestDispatched` omits, and the same commitment —
 * the two events are the same message seen from either pallet.
 */
export type IsmpRequestEvent = {
    destChain: StateMachineId;
    sourceChain: StateMachineId;
    /** Per-source-chain monotonic counter over all outgoing requests. */
    requestNonce: bigint;
    commitment: string;
};

/**
 * Emitted when a request we dispatched expired without being delivered.
 * Rust variant: `RequestTimedOut { dest, commitment }`
 *
 * The commitment is the one `RequestDispatched` recorded, so this closes out that exact
 * request. It was added in runtime spec 12; before that a timeout was unattributable.
 */
export type RequestTimedOutEvent = {
    dest: StateMachineId;
    commitment: string;
    /**
     * Which kind expired, added in spec 13. Two different failures: a POST never reached
     * the destination, a GET's answer never came back.
     */
    kind: RequestKind;
    nonce: bigint;
    timeoutTimestamp: TimeoutTimestamp;
    /** `0` for a GET. */
    bodyLen: number;
};

// ─── Inbound: arrived here ───────────────────────────────────────────────────

/**
 * Emitted when a message arrived and was handled.
 * Rust variant: `MessageReceived { source, from, body_len, commitment }`
 *
 * The body itself is never emitted — it is remote-controlled data and every event is
 * stored in the block — so `bodyLen` is all the event says about the payload.
 */
export type MessageReceivedEvent = {
    source: StateMachineId;
    /**
     * Originating module id, 0x-prefixed.
     *
     * Recorded but NOT authorised: the chain is pinned by the accepted-sources list and
     * the contents by a membership proof, so this is not a trusted identity.
     */
    from: string;
    bodyLen: number;
    /** The sender's own commitment, which joins this arrival to their `Request`. */
    commitment: string;
    /** The SENDER's nonce, on their chain — not a counter of ours. Added in spec 13. */
    nonce: bigint;
    /** The deadline the sender set. See `TimeoutTimestamp`. */
    timeoutTimestamp: TimeoutTimestamp;
};

/** Why an inbound message was not acted on. */
export type RejectReason = 'TooLarge' | 'Undecodable';

/**
 * Emitted when a message arrived from an accepted source but could not be understood.
 * Rust variant: `MessageRejected { source, reason, commitment }`
 *
 * Deliberately not an error: returning `Err` would revert the whole batch, destroying
 * unrelated messages a relayer delivered alongside it.
 */
export type MessageRejectedEvent = {
    source: StateMachineId;
    reason: RejectReason;
    commitment: string;
    /** Size of what was refused — with `reason: 'TooLarge'`, this is why. */
    bodyLen: number;
    nonce: bigint;
    timeoutTimestamp: TimeoutTimestamp;
};

/**
 * Emitted when a response to one of our GET requests arrived.
 * Rust variant: `GetResponseReceived { keys, found, commitment, dest, height, nonce,
 * timeout_timestamp }`
 *
 * `keys - found` were proven ABSENT, which is a valid answer rather than a failure. The
 * commitment is the GET's, not the response's — that is what links it to the dispatch.
 *
 * **Who delivers this is worth knowing.** The public relayer does not, for a Substrate
 * chain: Tesseract resolves GETs on Hyperbridge and hands the response only to EVM
 * sources (`tesseract/messaging/messaging/src/events.rs:314-336`, "Substrate sinks can't
 * verify the mmr proof"). So on a chain like Orbinum this event fires because something
 * of ours carried the proof back. The chain verifies it either way — the relayer supplies
 * bytes, not trust.
 */
export type GetResponseReceivedEvent = {
    keys: number;
    found: number;
    commitment: string;
    /** The chain that was read. Added in spec 13. */
    dest: StateMachineId;
    /**
     * The block height on the REMOTE chain that the read was proven against.
     *
     * The only genuine remote block number this pallet ever emits: an inbound POST
     * carries no origin height at all, because its proof is verified against
     * Hyperbridge's state rather than the origin's, so the origin's height never travels
     * on the wire.
     */
    height: bigint;
    nonce: bigint;
    timeoutTimestamp: TimeoutTimestamp;
};

// ─── Inbound allowlist ───────────────────────────────────────────────────────

/**
 * Emitted by `accept_source()` / `remove_source()`, both root-only.
 * Rust variants: `SourceAccepted { source }`, `SourceRemoved { source }`
 *
 * This is the gate that decides whether an inbound message is handled at all. A source
 * that is not accepted makes the callback return `Err`, which emits NOTHING — not even
 * `MessageRejected` — and leaves the sender to time out. These two events are therefore
 * the only on-chain record of why inbound traffic from a chain starts or stops.
 */
export type SourceChangedEvent = {
    source: StateMachineId;
};

// ─── Channel health ──────────────────────────────────────────────────────────

/**
 * Emitted by the protocol pallet when a counterparty's finality is proven to a new height.
 * Rust variant: `StateMachineUpdated { state_machine_id, latest_height }`
 *
 * Pushed by the relayer roughly once a minute with no originating extrinsic, so this is
 * channel health rather than user activity: the height climbing is the bridge working.
 */
export type StateMachineUpdatedEvent = {
    /**
     * Both halves of the id: the chain and the consensus client tracking it. The same
     * chain can be tracked under more than one client, so neither alone identifies it.
     */
    stateMachineId: StateMachineId;
    consensusStateId: string;
    latestHeight: bigint;
};

/**
 * Emitted when a fisherman repudiates a proven state commitment.
 * Rust variant: `StateCommitmentVetoed { height, fisherman }`
 *
 * Not an edge case: `veto_state_commitment` needs no proof and any collator may call it.
 * It rewinds the chain's own latest height and emits no update to say so, so a consumer
 * tracking only `StateMachineUpdated` keeps reporting a height the chain has repudiated.
 */
export type StateCommitmentVetoedEvent = {
    stateMachineId: StateMachineId;
    consensusStateId: string;
    /** The repudiated height. Anything at or above it is no longer proven. */
    height: bigint;
    /** Responsible fisherman, 0x-prefixed. Truncated to 32 bytes by the pallet. */
    fisherman: string;
};

// ─── Delivery confirmations ──────────────────────────────────────────────────

/**
 * Emitted by the protocol pallet when a request or response was handled.
 * Rust variants: `PostRequestHandled(RequestResponseHandled)`,
 * `GetRequestHandled(RequestResponseHandled)`
 *
 * Direction is NOT "handled means inbound" — the two disagree, and each one's side is
 * fixed by the guard on its handler:
 *   - `PostRequestHandled` fires on the DESTINATION (`dest_chain` must equal the host)
 *   - `GetRequestHandled` fires on the ORIGIN (it needs the host's own request commitment)
 */
export type RequestHandledEvent = {
    commitment: string;
    /**
     * Who submitted it, 0x-prefixed — and **not necessarily an account**.
     *
     * The host takes whatever the submitter signed with, verbatim up to 32 bytes
     * (`pallet-ismp/src/host.rs:351`). A public relayer signs with a key; a relaying
     * script can put an ASCII tag here. Rendering an arbitrary 18 bytes as an address is
     * a lie in monospace, so decide what it is before displaying it.
     */
    relayer: string;
};

/**
 * Emitted when a timeout was proven and handled.
 * Rust variants: `PostRequestTimeoutHandled(TimeoutHandled)`,
 * `GetRequestTimeoutHandled(TimeoutHandled)`
 *
 * A different struct from the pair above — it carries chains instead of a relayer, and
 * uses `source`/`dest` rather than `source_chain`/`dest_chain`. Both fire on the chain
 * that sent the original request.
 */
export type TimeoutHandledEvent = {
    commitment: string;
    source: StateMachineId;
    dest: StateMachineId;
};

// ─── Discriminated unions ────────────────────────────────────────────────────

/**
 * The `ismpMessaging` events this SDK models, as a discriminated union.
 *
 * All seven variants the pallet emits are here.
 */
export type IsmpMessagingEvent =
    | { type: 'RequestDispatched'; data: RequestDispatchedEvent }
    | { type: 'MessageReceived'; data: MessageReceivedEvent }
    | { type: 'MessageRejected'; data: MessageRejectedEvent }
    | { type: 'GetResponseReceived'; data: GetResponseReceivedEvent }
    | { type: 'RequestTimedOut'; data: RequestTimedOutEvent }
    | { type: 'SourceAccepted'; data: SourceChangedEvent }
    | { type: 'SourceRemoved'; data: SourceChangedEvent };

/**
 * The `ismp` protocol-pallet events this SDK models.
 *
 * NOT every variant. Absent, deliberately: `ConsensusClientCreated`,
 * `ConsensusClientFrozen` and `Errors` describe consensus-client lifecycle, which the
 * `ismp_*` RPCs answer better than an event stream; `RelayerFeeWithdrawn` can only be
 * triggered by the configured coprocessor and so never fires on a chain like this one;
 * and `Response` is never deposited by `pallet-ismp` at all — its only emitter is the
 * Hyperbridge-nexus state-coprocessor pallet. A consumer that needs any of them reads the
 * raw event.
 */
export type IsmpEvent =
    | { type: 'Request'; data: IsmpRequestEvent }
    | { type: 'StateMachineUpdated'; data: StateMachineUpdatedEvent }
    | { type: 'StateCommitmentVetoed'; data: StateCommitmentVetoedEvent }
    | { type: 'PostRequestHandled'; data: RequestHandledEvent }
    | { type: 'GetRequestHandled'; data: RequestHandledEvent }
    | { type: 'PostRequestTimeoutHandled'; data: TimeoutHandledEvent }
    | { type: 'GetRequestTimeoutHandled'; data: TimeoutHandledEvent };
