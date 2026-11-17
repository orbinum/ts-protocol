import { describe, expect, it } from 'vitest';
import {
    ENCRYPTED_MEMO_SIZE,
    MEMO_FORMAT_HANDSHAKE,
    MEMO_FORMAT_OFFSET,
    MEMO_FORMAT_TAGGED,
    MEMO_TAG_OFFSET,
    MEMO_TAG_SIZE,
    memoFormatOf,
} from '../../../src/index';
import { MemoFormat } from '../../../src/internal';

const NONCE_SIZE = 12;
const EPH_PK_SIZE = 32;

describe('memo format constants', () => {
    // Mirrors `pallet-shielded-pool` `types/memo.rs` (`MAX_ENCRYPTED_MEMO_SIZE`,
    // `MEMO_FORMAT_BYTE_INDEX`, `MEMO_FORMAT_TAGGED`, `MEMO_FORMAT_HANDSHAKE`), which
    // pins the same values in `the_memo_format_constants_are_stable`.
    it('match the pallet', () => {
        expect(ENCRYPTED_MEMO_SIZE).toBe(180);
        expect(MEMO_FORMAT_OFFSET).toBe(1);
        expect(MEMO_FORMAT_TAGGED).toBe(0x01);
        expect(MEMO_FORMAT_HANDSHAKE).toBe(0x02);
    });

    it('lay the format byte and the tag inside the public nonce, apart from the view tag', () => {
        expect(MEMO_TAG_OFFSET).toBe(2);
        expect(MEMO_TAG_SIZE).toBe(8);
        expect(MEMO_FORMAT_OFFSET).toBeGreaterThan(0); // byte 0 is the view tag
        expect(MEMO_TAG_OFFSET).toBeGreaterThan(MEMO_FORMAT_OFFSET);
        expect(MEMO_TAG_OFFSET + MEMO_TAG_SIZE).toBeLessThanOrEqual(NONCE_SIZE);
    });
});

describe('memo format byte', () => {
    it('reads TAGGED and HANDSHAKE, and nothing else', () => {
        const memo = new Uint8Array(ENCRYPTED_MEMO_SIZE);
        for (let byte = 0; byte < 256; byte++) {
            memo[MEMO_FORMAT_OFFSET] = byte;
            const expected =
                byte === MEMO_FORMAT_TAGGED || byte === MEMO_FORMAT_HANDSHAKE ? byte : null;
            expect(memoFormatOf(memo)).toBe(expected);
        }
    });

    it('is null for anything that is not a full memo, whatever its second byte', () => {
        for (const size of [0, 1, 2, 10, ENCRYPTED_MEMO_SIZE - 1, ENCRYPTED_MEMO_SIZE + 1]) {
            const memo = new Uint8Array(size).fill(MEMO_FORMAT_TAGGED);
            expect(memoFormatOf(memo)).toBeNull();
        }
        // A hex string or a plain array of the right length is no memo either.
        const notBytes = Array.from({ length: ENCRYPTED_MEMO_SIZE }, () => MEMO_FORMAT_TAGGED);
        expect(memoFormatOf(notBytes as unknown as Uint8Array)).toBeNull();
        expect(memoFormatOf('01'.repeat(90) as unknown as Uint8Array)).toBeNull();
    });

    it('a public memo (zero ephPk) declares a format like any other', () => {
        const memo = new Uint8Array(ENCRYPTED_MEMO_SIZE).fill(0x33);
        memo.fill(0, ENCRYPTED_MEMO_SIZE - EPH_PK_SIZE);
        memo[MEMO_FORMAT_OFFSET] = MEMO_FORMAT_HANDSHAKE;
        expect(memoFormatOf(memo)).toBe(MEMO_FORMAT_HANDSHAKE);
        memo[MEMO_FORMAT_OFFSET] = 0x33;
        expect(memoFormatOf(memo)).toBeNull();
    });

    it('a dummy memo is TAGGED, so the chain accepts it once the format is enforced', () => {
        const dummy = MemoFormat.dummy();
        expect(dummy).toHaveLength(ENCRYPTED_MEMO_SIZE);
        expect(memoFormatOf(dummy)).toBe(MEMO_FORMAT_TAGGED);
        expect(dummy.every((b, i) => i === MEMO_FORMAT_OFFSET || b === 0)).toBe(true);
        // The all-zero dummy older wallets built declares no format.
        expect(memoFormatOf(new Uint8Array(ENCRYPTED_MEMO_SIZE))).toBeNull();
        // Each call is a fresh buffer: mutating one never changes the next.
        dummy[MEMO_FORMAT_OFFSET] = 0;
        expect(memoFormatOf(MemoFormat.dummy())).toBe(MEMO_FORMAT_TAGGED);
    });
});
