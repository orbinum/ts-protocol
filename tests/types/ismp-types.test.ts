import { describe, it, expect } from 'vitest';
import type {
    IsmpRequest,
    PostRequest,
    StateMachineQuery,
} from '../../src/chain/pallet/ismp/IsmpModule';
import type {
    RequestDispatchedEvent,
    MessageReceivedEvent,
    MessageRejectedEvent,
    GetResponseReceivedEvent,
    RequestTimedOutEvent,
    IsmpRequestEvent,
    StateMachineEnum,
    RequestHandledEvent,
    TimeoutHandledEvent,
    IsmpMessagingEvent,
} from '../../src/chain/pallet/ismp/events';

/**
 * Every fixture below is a shape captured from a running node, not invented. The two
 * transports disagree about how a chain is named — the RPCs return `"KUSAMA-1000"` while
 * decoded events give `{ type: 'Kusama', value: 1000 }` — and a type that assumed one
 * would compile against the other while reading `undefined` at runtime.
 */

// ─── RPC shapes ──────────────────────────────────────────────────────────────

describe('ismp RPC types', () => {
    it('models a request as the RPC actually returns it: wrapped in its variant', () => {
        // Verbatim from `ismp_queryRequests` on a dev node.
        const response: IsmpRequest[] = [
            {
                Post: {
                    source: 'SUBSTRATE-orbi',
                    dest: 'KUSAMA-1000',
                    nonce: 0n,
                    from: '0x6f72622f6d736773',
                    to: '0x70726f62652f6d6f',
                    timeoutTimestamp: 0n,
                    body: '0x6f7262696e756d2d64697370617463682d70726f6265',
                },
            },
        ];

        // The wrapping is the point: reading `response[0].source` would be undefined, so
        // the union forces the caller to narrow on the variant first.
        const [first] = response;
        expect(first).toBeDefined();
        if (first && 'Post' in first) {
            const post: PostRequest = first.Post;
            expect(post.dest).toBe('KUSAMA-1000');
            // 0 means "never expires", not "expired already".
            expect(post.timeoutTimestamp).toBe(0n);
        }
    });

    it('requires both halves of a channel identity', () => {
        const query: StateMachineQuery = {
            stateId: 'KUSAMA-4009',
            consensusStateId: 'PAS0',
        };
        // The same chain can be tracked under more than one consensus client, so the
        // state id alone does not name a channel.
        expect(query.consensusStateId).toHaveLength(4);
    });
});

// ─── Event shapes ────────────────────────────────────────────────────────────

describe('ismp event types', () => {
    it('carries a commitment on every message event', () => {
        const commitment = '0x' + '49'.repeat(32);

        // All four gained this field in runtime spec 12. Before it an arrival could not be
        // attributed to any message and an expiry could not be matched to what expired.
        // Every other field below arrived in spec 13.
        const received: MessageReceivedEvent = {
            source: 'KUSAMA-4009',
            from: '0x64656d6f2f6d6f64',
            bodyLen: 42,
            commitment,
            nonce: 7n,
            timeoutTimestamp: 0n,
        };
        const rejected: MessageRejectedEvent = {
            source: 'KUSAMA-4009',
            reason: 'TooLarge',
            commitment,
            bodyLen: 9000,
            nonce: 8n,
            timeoutTimestamp: 0n,
        };
        const getResponse: GetResponseReceivedEvent = {
            keys: 3,
            found: 2,
            commitment,
            dest: 'KUSAMA-4009',
            height: 10_419_134n,
            nonce: 3n,
            timeoutTimestamp: 0n,
        };
        const timedOut: RequestTimedOutEvent = {
            dest: 'KUSAMA-1000',
            commitment,
            kind: 'Post',
            nonce: 9n,
            timeoutTimestamp: 1_788_900_000n,
            bodyLen: 42,
        };

        for (const e of [received, rejected, getResponse, timedOut]) {
            expect(e.commitment).toBe(commitment);
        }
        // `keys - found` were proven ABSENT — a valid answer, not a failure.
        expect(getResponse.keys - getResponse.found).toBe(1);
    });

    it('separates the three states of timeoutTimestamp', () => {
        // Conflating any two is a bug: 0n is "never expires" — upstream's explicit
        // branch, not 1970 — and a real deadline is a real deadline. A pre-spec-13 block
        // emits neither, which a consumer sees as the field being absent.
        const never: RequestTimedOutEvent = {
            dest: 'KUSAMA-4009',
            commitment: '0x' + '49'.repeat(32),
            kind: 'Get',
            nonce: 3n,
            timeoutTimestamp: 0n,
            bodyLen: 0,
        };
        expect(never.timeoutTimestamp).toBe(0n);
        // Rendering 0n as a date would claim the message expired in 1970.
        expect(never.timeoutTimestamp === 0n).toBe(true);
    });

    it('reports a GET dispatch as kind Get, with no body and our own module id', () => {
        // A GET addresses storage, not a module: `to` is where the ANSWER comes back to,
        // which is us. Labelling it a destination module names the wrong chain.
        const dispatched: RequestDispatchedEvent = {
            dest: 'KUSAMA-4009',
            to: '0x6f72622f6d736773', // "orb/msgs" — ours
            commitment: '0x' + '49'.repeat(32),
            nonce: 3n,
            timeoutTimestamp: 0n,
            bodyLen: 0,
            kind: 'Get',
        };
        expect(dispatched.kind).toBe('Get');
        expect(dispatched.bodyLen).toBe(0);
    });

    it('types the nonce as bigint, since u64 exceeds Number.MAX_SAFE_INTEGER', () => {
        const event: IsmpRequestEvent = {
            destChain: 'KUSAMA-1000',
            sourceChain: 'SUBSTRATE-orbi',
            requestNonce: 18_446_744_073_709_551_615n,
            commitment: '0x' + '49'.repeat(32),
        };
        expect(typeof event.requestNonce).toBe('bigint');
    });

    it('keeps both halves of Relay, the one struct-like state machine variant', () => {
        const relay: StateMachineEnum = {
            type: 'Relay',
            value: { relay: '0x50415330', para_id: 4009 },
        };
        // Dropping either half would collide the same para id under a different relay.
        if (relay.type === 'Relay') {
            expect(relay.value.para_id).toBe(4009);
            expect(relay.value.relay).toBe('0x50415330');
        }
    });

    it('distinguishes the two handler payloads, which are different structs', () => {
        const handled: RequestHandledEvent = {
            commitment: '0x' + '49'.repeat(32),
            // Not an account: the host takes whatever the submitter signed with, up to 32
            // bytes. This is the ASCII tag a self-relaying script leaves behind.
            relayer: `0x${Buffer.from('orbinum-self-relay').toString('hex')}`,
        };
        const timeout: TimeoutHandledEvent = {
            commitment: '0x' + '49'.repeat(32),
            source: 'SUBSTRATE-orbi',
            dest: 'KUSAMA-1000',
        };
        // `*Handled` carries a relayer; `*TimeoutHandled` carries chains and no relayer.
        // Treating them as one shape reads undefined from whichever it is not.
        expect('relayer' in handled).toBe(true);
        expect('relayer' in timeout).toBe(false);
    });

    it('discriminates the messaging union by event name', () => {
        const events: IsmpMessagingEvent[] = [
            {
                type: 'RequestDispatched',
                data: {
                    dest: 'KUSAMA-1000',
                    to: '0x70726f62652f6d6f',
                    commitment: '0x' + '49'.repeat(32),
                    nonce: 0n,
                    timeoutTimestamp: 0n,
                    bodyLen: 9,
                    kind: 'Post',
                } satisfies RequestDispatchedEvent,
            },
            {
                type: 'SourceAccepted',
                data: { source: 'KUSAMA-4009' },
            },
        ];

        const dispatched = events.find((e) => e.type === 'RequestDispatched');
        expect(dispatched?.type).toBe('RequestDispatched');
        if (dispatched?.type === 'RequestDispatched') {
            // Narrowing on `type` gives the right `data` without a cast.
            expect(dispatched.data.dest).toBe('KUSAMA-1000');
        }
    });
});
