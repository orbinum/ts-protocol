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
                    nonce: 0,
                    from: '0x6f72622f6d736773',
                    to: '0x70726f62652f6d6f',
                    timeoutTimestamp: 0,
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
            expect(post.timeoutTimestamp).toBe(0);
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
        const received: MessageReceivedEvent = {
            source: 'KUSAMA-4009',
            from: '0x64656d6f2f6d6f64',
            bodyLen: 42,
            commitment,
        };
        const rejected: MessageRejectedEvent = {
            source: 'KUSAMA-4009',
            reason: 'TooLarge',
            commitment,
        };
        const getResponse: GetResponseReceivedEvent = { keys: 3, found: 2, commitment };
        const timedOut: RequestTimedOutEvent = { dest: 'KUSAMA-1000', commitment };

        for (const e of [received, rejected, getResponse, timedOut]) {
            expect(e.commitment).toBe(commitment);
        }
        // `keys - found` were proven ABSENT — a valid answer, not a failure.
        expect(getResponse.keys - getResponse.found).toBe(1);
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
            relayer: '0xaabb',
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
