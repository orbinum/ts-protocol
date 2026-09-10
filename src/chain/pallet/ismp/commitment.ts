/**
 * Rebuilding an ISMP request commitment off-chain.
 *
 * A commitment is `keccak256(abi.encode(request))` — **Solidity ABI, not SCALE**. This is
 * the single most surprising thing in the protocol from the Substrate side, and getting it
 * wrong fails silently: `Request::encode()` is an inherent method on the enum that SHADOWS
 * the SCALE `Encode` trait (`ismp-2606.1.0/src/router.rs:263-266`), so Rust code reads as
 * if it were SCALE while producing 32-byte-word ABI output. Off-chain, a SCALE encoding
 * hashes perfectly well — it just yields a value the chain has never heard of, which
 * surfaces much later as `UnknownRequest` rather than as an encoding error.
 *
 * The crate is explicit about why: "matching Solidity's `abi.encode(...)` semantics. This
 * prevents hash malleability vulnerabilities that exist with packed encoding."
 *
 * Two further traps, both verified against the pallet's own output rather than inferred:
 *
 *   1. `source` and `dest` are ABI `bytes` holding the DISPLAY string of the state
 *      machine — `"SUBSTRATE-orbi"`, `"KUSAMA-4009"` (`abi.rs:64-76`,
 *      `.to_string().into_bytes()`). Not the SCALE variant. `ismp_queryRequests` returns
 *      exactly these strings, so its output can be hashed as-is; there is nothing to
 *      "decode" first.
 *   2. The GET field ORDER is not the Rust struct's. Per `EvmHost.json`'s `struct
 *      GetRequest` it is `source, dest, nonce, from, timeoutTimestamp, keys, height,
 *      context` — `timeoutTimestamp` moves up next to `from`, and `context` goes last.
 *
 * Why this belongs in the SDK: reproducing a commitment is what lets a caller join an
 * event to the request it describes, and what a relayer must do to prove one. The ABI is
 * hand-rolled (~40 lines) rather than pulled from `alloy`/`ethers` so the SDK keeps its
 * current dependency surface.
 */

import { keccak_256 } from '@noble/hashes/sha3.js';
import type { GetRequest, IsmpRequest, PostRequest } from './IsmpModule';

/** ABI word: 32 bytes, big-endian, left-padded. */
function word(value: bigint | number): Uint8Array {
    const out = new Uint8Array(32);
    let n = BigInt(value);
    for (let i = 31; i >= 0 && n > 0n; i--) {
        out[i] = Number(n & 0xffn);
        n >>= 8n;
    }
    return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }
    return out;
}

/** `0x…` hex to bytes. Anything else is treated as UTF-8 text, which is what a state machine id is. */
function toBytes(input: string): Uint8Array {
    if (/^0x([0-9a-fA-F]{2})*$/.test(input)) {
        const body = input.slice(2);
        const out = new Uint8Array(body.length / 2);
        for (let i = 0; i < out.length; i++)
            out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
        return out;
    }
    return new TextEncoder().encode(input);
}

/** ABI `bytes`: a length word, then the payload right-padded to a 32-byte multiple. */
function dynBytes(input: string): Uint8Array {
    const raw = toBytes(input);
    const padded = new Uint8Array(Math.ceil(raw.length / 32) * 32);
    padded.set(raw);
    return concat([word(raw.length), padded]);
}

/** ABI `bytes[]`: a count word, one offset per element, then each element's `bytes`. */
function dynBytesArray(items: string[]): Uint8Array {
    const encoded = items.map(dynBytes);
    let offset = items.length * 32;
    const heads = encoded.map((e) => {
        const head = word(offset);
        offset += e.length;
        return head;
    });
    return concat([word(items.length), ...heads, ...encoded]);
}

/** One field of an ABI struct: inline in the head, or an offset pointing into the tail. */
type Field = { dynamic: false; value: bigint | number } | { dynamic: true; value: Uint8Array };

/**
 * `abi.encode(struct)`.
 *
 * A leading offset word to the tuple body is included, matching how `alloy`'s
 * `abi_encode` renders a top-level struct — and, more to the point, matching the bytes the
 * pallet hashes.
 */
function encodeStruct(fields: Field[]): Uint8Array {
    let tailOffset = fields.length * 32;
    const heads: Uint8Array[] = [];
    const tails: Uint8Array[] = [];
    for (const f of fields) {
        if (f.dynamic) {
            heads.push(word(tailOffset));
            tails.push(f.value);
            tailOffset += f.value.length;
        } else {
            heads.push(word(f.value));
        }
    }
    return concat([word(32), ...heads, ...tails]);
}

/**
 * The ABI encoding of a POST request, in the shape `ismp_queryRequests` returns.
 *
 * `source`/`dest` are passed through verbatim: they are already the display strings the
 * protocol hashes.
 */
export function encodePostRequest(p: PostRequest): Uint8Array {
    return encodeStruct([
        { dynamic: true, value: dynBytes(p.source) },
        { dynamic: true, value: dynBytes(p.dest) },
        { dynamic: false, value: p.nonce },
        { dynamic: true, value: dynBytes(p.from) },
        { dynamic: true, value: dynBytes(p.to) },
        { dynamic: false, value: p.timeoutTimestamp },
        { dynamic: true, value: dynBytes(p.body) },
    ]);
}

/** The ABI encoding of a GET request. Note the field order — see the module docs. */
export function encodeGetRequest(g: GetRequest): Uint8Array {
    return encodeStruct([
        { dynamic: true, value: dynBytes(g.source) },
        { dynamic: true, value: dynBytes(g.dest) },
        { dynamic: false, value: g.nonce },
        { dynamic: true, value: dynBytes(g.from) },
        { dynamic: false, value: g.timeoutTimestamp },
        { dynamic: true, value: dynBytesArray(g.keys) },
        { dynamic: false, value: g.height },
        { dynamic: true, value: dynBytes(g.context) },
    ]);
}

/**
 * The commitment of a request, as the chain computed it.
 *
 * Takes the variant-wrapped shape `ismp_queryRequests` returns, so the round trip is:
 * look a request up by commitment, hash it back, and the two must match. They will not if
 * any field was reconstructed rather than read — which is precisely the check worth making
 * before spending fifteen minutes waiting for a relayer.
 */
export function requestCommitment(request: IsmpRequest): string {
    const bytes =
        'Post' in request ? encodePostRequest(request.Post) : encodeGetRequest(request.Get);
    return `0x${Buffer.from(keccak_256(bytes)).toString('hex')}`;
}
