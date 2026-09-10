import { describe, it, expect } from 'vitest';
import {
    encodeGetRequest,
    encodePostRequest,
    requestCommitment,
} from '../../src/chain/pallet/ismp/commitment';
import type { GetRequest, PostRequest } from '../../src/chain/pallet/ismp/IsmpModule';

/**
 * Ground truth, printed by the pallet itself.
 *
 * These two vectors come from `hash_request::<pallet_ismp::Pallet<Test>>` inside the
 * runtime — the exact function the chain uses — not from a reimplementation. They are the
 * only reason to trust the encoder: a SCALE encoding of the same request hashes fine and
 * yields a value the chain has never seen, so "it produces a hash" proves nothing.
 *
 * If an upstream bump changes the wire format, these fail loudly here instead of producing
 * commitments that no relayer can match.
 */
const POST: PostRequest = {
    source: 'SUBSTRATE-orbi',
    dest: 'KUSAMA-4009',
    nonce: 4n,
    from: '0x6f72622f6d736773', // "orb/msgs"
    to: '0x64656d6f2f6d6f64', // "demo/mod"
    timeoutTimestamp: 0n,
    body: '0x01020304',
};
const POST_COMMITMENT = '0xe51e536288e74f85fb16bc89fe4d43feb49c15049776de908bb402310bd389bc';

const GET: GetRequest = {
    source: 'SUBSTRATE-orbi',
    dest: 'KUSAMA-4009',
    nonce: 7n,
    from: '0x6f72622f6d736773',
    keys: [`0x${'aa'.repeat(32)}`],
    height: 4242n,
    context: '0x',
    timeoutTimestamp: 0n,
};
const GET_COMMITMENT = '0xc7f995f640ae3d0ccab18b0ff1280f68d5c906c60e5d62862aa457150d8792ee';

describe('requestCommitment', () => {
    it('reproduces the commitment the pallet computed for a POST', () => {
        expect(requestCommitment({ Post: POST })).toBe(POST_COMMITMENT);
    });

    it('reproduces the commitment the pallet computed for a GET', () => {
        // The GET field order is not the Rust struct's — timeoutTimestamp sits next to
        // `from` and `context` goes last. Swapping keys and height (the mistake that is
        // easy to make from the struct definition) changes this hash.
        expect(requestCommitment({ Get: GET })).toBe(GET_COMMITMENT);
    });

    it('hashes a real testnet GET back to the commitment the chain recorded', () => {
        // Read from `ismp_queryRequests` on rpc-1 for the first cross-chain read this
        // chain performed (block #786579 → answered #786580). The RPC's own output,
        // unmodified: the display strings ARE what gets hashed, so nothing is decoded
        // first.
        const stored: GetRequest = {
            source: 'SUBSTRATE-orbi',
            dest: 'KUSAMA-4009',
            nonce: 3n,
            from: '0x6f72622f6d736773',
            keys: [
                // "RequestReceipts" ++ a commitment: a key inside Hyperbridge's ISMP child
                // trie, which is the only part of it this chain holds a root for.
                '0x5265717565737452656365697074730034e349c4a5cf537532f5f4263a0e291f6efbbcd1115e2b8fe01d41fa4cceb3',
            ],
            height: 10419134n,
            context: '0x',
            timeoutTimestamp: 0n,
        };
        expect(requestCommitment({ Get: stored })).toBe(
            '0x532f2d62a60ef348a6a864b336fa64fbc979871670e2a7fb2989fff9a9cf8767'
        );
    });
});

describe('abi.encode shape', () => {
    it('emits whole 32-byte words', () => {
        expect(encodePostRequest(POST).length % 32).toBe(0);
        expect(encodeGetRequest(GET).length % 32).toBe(0);
    });

    it('carries the state machines as their display strings, not SCALE variants', () => {
        // `abi.rs:64-76` does `.to_string().into_bytes()`. This is why the RPC's
        // human-readable output is hashable as-is, and why a caller must NOT convert
        // "KUSAMA-4009" into `{ type: 'Kusama', value: 4009 }` first.
        const hex = Buffer.from(encodePostRequest(POST)).toString('hex');
        expect(hex).toContain(Buffer.from('SUBSTRATE-orbi').toString('hex'));
        expect(hex).toContain(Buffer.from('KUSAMA-4009').toString('hex'));
    });

    it('a changed field changes the commitment', () => {
        // Cheap guard against an encoder that drops a field: dropping one silently would
        // still produce a plausible hash, and the vectors above would be the only thing
        // catching it. This makes the sensitivity explicit per field.
        const base = requestCommitment({ Get: GET });
        expect(requestCommitment({ Get: { ...GET, nonce: 8n } })).not.toBe(base);
        expect(requestCommitment({ Get: { ...GET, height: 4243n } })).not.toBe(base);
        expect(requestCommitment({ Get: { ...GET, timeoutTimestamp: 1n } })).not.toBe(base);
        expect(requestCommitment({ Get: { ...GET, context: '0x00' } })).not.toBe(base);
        expect(requestCommitment({ Get: { ...GET, keys: [...GET.keys, '0x01'] } })).not.toBe(base);
    });
});
