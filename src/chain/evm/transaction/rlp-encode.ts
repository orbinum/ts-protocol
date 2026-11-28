/**
 * Recursive Length Prefix, Ethereum's serialisation for transactions.
 *
 * Encode only: a wallet builds what it signs and never reads a transaction back in
 * this form (a node answers JSON). Integers are not an RLP type: encode them with
 * `quantityBytes` first, which gives the minimal big-endian form RLP expects.
 */
import { concatBytes } from './concat-bytes';

/** A byte string, or a list of items. */
export type RlpInput = Uint8Array | readonly RlpInput[];

/** The RLP encoding of `input`. */
export function rlpEncode(input: RlpInput): Uint8Array {
    if (input instanceof Uint8Array) {
        // A single byte below 0x80 is its own encoding.
        if (input.length === 1 && input[0]! < 0x80) return input;
        return concatBytes([lengthPrefix(input.length, 0x80), input]);
    }
    const payload = concatBytes(input.map(rlpEncode));
    return concatBytes([lengthPrefix(payload.length, 0xc0), payload]);
}

/** The prefix for a payload of `length` bytes: `offset` is 0x80 for strings, 0xc0 for lists. */
function lengthPrefix(length: number, offset: number): Uint8Array {
    if (length < 56) return Uint8Array.of(offset + length);
    const lengthBytes = bigEndian(length);
    return concatBytes([Uint8Array.of(offset + 55 + lengthBytes.length), lengthBytes]);
}

function bigEndian(value: number): Uint8Array {
    const bytes: number[] = [];
    for (let rest = value; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256);
    return Uint8Array.from(bytes);
}
