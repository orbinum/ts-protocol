import { describe, it, expect } from 'vitest';
import { encode, encodeHex, decodeUint } from '../../../src/chain/evm/precompiles/abi';
import { fromHex } from '../../../src/foundation/encoding/hex';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** 4-byte test selector */
const SEL = new Uint8Array([0x12, 0x34, 0x56, 0x78]);

/** Build a 32-byte slot with value right-aligned. */
function slot32(value: number): Uint8Array {
    const s = new Uint8Array(32);
    s[31] = value;
    return s;
}

// ─── fromHex (via utils/hex) ─────────────────────────────────────────────────

describe('fromHex', () => {
    it("returns empty array for '0x'", () => {
        expect(fromHex('0x')).toEqual(new Uint8Array(0));
    });

    it('returns empty array for empty string', () => {
        expect(fromHex('')).toEqual(new Uint8Array(0));
    });

    it('decodes 0x1234 to [0x12, 0x34]', () => {
        expect(fromHex('0x1234')).toEqual(new Uint8Array([0x12, 0x34]));
    });

    it('handles string without 0x prefix', () => {
        expect(fromHex('deadbeef')).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    });
});

// ─── decodeUint ───────────────────────────────────────────────────────────────

describe('decodeUint', () => {
    it('returns 0n for a zero slot', () => {
        expect(decodeUint(new Uint8Array(32))).toBe(0n);
    });

    it('reads 1n from last byte', () => {
        expect(decodeUint(slot32(1))).toBe(1n);
    });

    it('reads 255n from last byte', () => {
        expect(decodeUint(slot32(255))).toBe(255n);
    });

    it('respects the offset parameter', () => {
        const data = new Uint8Array(64);
        data[63] = 7; // value at slot 1 (offset=32)
        expect(decodeUint(data, 32)).toBe(7n);
    });

    it('reads a 256n correctly (bytes 30=0x01, 31=0x00)', () => {
        const s = new Uint8Array(32);
        s[30] = 1;
        expect(decodeUint(s)).toBe(256n);
    });
});

// ─── encode / encodeHex ───────────────────────────────────────────────────────

describe('encode — static types', () => {
    it('prepends the 4-byte selector', () => {
        const result = encode(SEL);
        expect(Array.from(result.slice(0, 4))).toEqual([0x12, 0x34, 0x56, 0x78]);
    });

    it('encodes uint right-aligned in 32 bytes', () => {
        const result = encode(SEL, { type: 'uint', value: 1n });
        // bytes 4..35: uint256(1) → last byte = 1, rest zeros
        expect(result[35]).toBe(1);
        for (let i = 4; i < 35; i++) expect(result[i]).toBe(0);
    });

    it('encodes uint 256n as [30]=1,[31]=0', () => {
        const result = encode(SEL, { type: 'uint', value: 256n });
        expect(result[34]).toBe(1);
        expect(result[35]).toBe(0);
    });

    it('encodes bytes32 left-aligned in slot', () => {
        const b32 = new Uint8Array(32).fill(0xaa);
        const result = encode(SEL, { type: 'bytes32', value: b32 });
        for (let i = 0; i < 32; i++) expect(result[4 + i]).toBe(0xaa);
    });

    it('total size for 2 static params is 4 + 2×32 = 68 bytes', () => {
        const result = encode(SEL, { type: 'uint', value: 1n }, { type: 'uint', value: 2n });
        expect(result.length).toBe(68);
    });
});

describe('encode — dynamic types', () => {
    it('encodes bytes: selector(4) + ptr(32) + len(32) + data_padded', () => {
        const payload = new Uint8Array([0x01, 0x02, 0x03]);
        const result = encode(SEL, { type: 'bytes', value: payload });
        // 4 + 32 (head: ptr=32) + 32 (len=3) + 32 (padded data) = 100
        expect(result.length).toBe(100);
        // head slot = uint256(32)
        expect(result[35]).toBe(32);
        // length slot = uint256(3)
        expect(result[67]).toBe(3);
        // first 3 bytes of data
        expect(result[68]).toBe(0x01);
        expect(result[69]).toBe(0x02);
        expect(result[70]).toBe(0x03);
    });
});

describe('encodeHex', () => {
    it('returns 0x-prefixed hex string', () => {
        const result = encodeHex(SEL, { type: 'uint', value: 0n });
        expect(result.startsWith('0x')).toBe(true);
    });

    it('starts with the selector hex', () => {
        expect(encodeHex(SEL).startsWith('0x12345678')).toBe(true);
    });

    it('result length is 2 + 2 × (4 + n×32) chars for n static params', () => {
        // 0 params: '0x' + 8 hex chars (4 bytes selector)
        expect(encodeHex(SEL).length).toBe(10);
        // 1 static param: '0x' + (4+32)×2 = 72
        expect(encodeHex(SEL, { type: 'uint', value: 1n }).length).toBe(74);
    });
});

// ─── The encoder refuses what it cannot represent ────────────────────────────
//
// The type says `bytes32` is "exactly 32 bytes", but a type is a promise the
// caller makes, not one the encoder keeps. Silently reshaping a wrong-sized
// value is the failure mode this whole module exists to remove: the bytes go on
// chain as a commitment or a nullifier, where a changed value is not an error
// but a note nobody can find or spend.

describe('bytes32 is not silently reshaped', () => {
    it('refuses more than 32 bytes instead of keeping the first 32', () => {
        // The tail was dropped, so a 40-byte value encoded as a DIFFERENT
        // 32-byte one that the chain accepts without complaint.
        expect(() =>
            encode(SEL, { type: 'bytes32', value: new Uint8Array(33).fill(0xaa) })
        ).toThrow();
        expect(() =>
            encode(SEL, { type: 'bytes32', value: new Uint8Array(64).fill(0xaa) })
        ).toThrow();
    });

    it('refuses fewer than 32 bytes instead of right-padding with zeros', () => {
        // Zero-padding a short value produces a well-formed slot for a value
        // nobody asked to encode.
        expect(() => encode(SEL, { type: 'bytes32', value: new Uint8Array(31) })).toThrow();
        expect(() => encode(SEL, { type: 'bytes32', value: new Uint8Array([1, 2, 3]) })).toThrow();
        expect(() => encode(SEL, { type: 'bytes32', value: new Uint8Array(0) })).toThrow();
    });

    it('still encodes exactly 32 bytes unchanged', () => {
        const value = new Uint8Array(32).fill(0xab);
        const out = encode(SEL, { type: 'bytes32', value });

        expect(out.slice(4)).toEqual(value);
    });
});
