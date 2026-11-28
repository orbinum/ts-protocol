/**
 * RLP against the examples of the Ethereum wiki's RLP page: the encoding is a wire
 * format, so a byte off is a transaction no node accepts.
 */
import { describe, expect, it } from 'vitest';
import { toHex } from '../../../../src/foundation/encoding/hex';
import { quantityBytes } from '../../../../src/chain/evm/transaction/quantity-bytes';
import { rlpEncode, type RlpInput } from '../../../../src/chain/evm/transaction/rlp-encode';

const text = (s: string) => new TextEncoder().encode(s);
const rlp = (input: RlpInput) => toHex(rlpEncode(input));

describe('rlpEncode', () => {
    it('encodes strings', () => {
        expect(rlp(text('dog'))).toBe('0x83646f67');
        expect(rlp(text(''))).toBe('0x80');
        expect(rlp(Uint8Array.of(0x0f))).toBe('0x0f');
        expect(rlp(Uint8Array.of(0x80))).toBe('0x8180');
    });

    it('encodes a string of 56 bytes or more with a length of its length', () => {
        const lorem = 'Lorem ipsum dolor sit amet, consectetur adipisicing elit';
        expect(rlp(text(lorem))).toBe(
            '0xb838' + Array.from(text(lorem), (b) => b.toString(16).padStart(2, '0')).join('')
        );
    });

    it('encodes lists, nested', () => {
        expect(rlp([text('cat'), text('dog')])).toBe('0xc88363617483646f67');
        expect(rlp([])).toBe('0xc0');
        // The set-theoretical representation of three.
        expect(rlp([[], [[]], [[], [[]]]])).toBe('0xc7c0c1c0c3c0c1c0');
    });

    it('encodes integers through quantityBytes', () => {
        expect(rlp(quantityBytes(0n, 'n'))).toBe('0x80');
        expect(rlp(quantityBytes(15n, 'n'))).toBe('0x0f');
        expect(rlp(quantityBytes(1024n, 'n'))).toBe('0x820400');
    });
});

describe('quantityBytes', () => {
    it('drops leading zeros and encodes zero as empty', () => {
        expect(toHex(quantityBytes(0n, 'n'))).toBe('0x');
        expect(toHex(quantityBytes(256n, 'n'))).toBe('0x0100');
    });

    it('refuses a negative integer, naming the field', () => {
        expect(() => quantityBytes(-1n, 'tx.nonce')).toThrow('tx.nonce');
    });
});
