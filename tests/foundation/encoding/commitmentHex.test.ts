import { describe, it, expect } from 'vitest';
import { commitmentHexOf, bigintTo32Le } from '../../../src/foundation/encoding/bytes';
import { toHex } from '../../../src/foundation/encoding/hex';

/**
 * `commitmentHexOf` — the on-chain hex form of a commitment.
 *
 * Little-endian, and the direction is not cosmetic: every index into a note —
 * scan hints, vault records, a note's `commitmentHex` — is keyed by it. Encoding
 * big-endian produces a well-formed hex string that matches nothing, so a
 * lookup finds no note and an ownership check answers "not mine" for every one,
 * with nothing thrown to explain it.
 */
describe('commitmentHexOf', () => {
    it('encodes little-endian', () => {
        // 1 is the clearest case: LE puts the byte first, BE puts it last.
        expect(commitmentHexOf(1n)).toBe('0x' + '01' + '00'.repeat(31));
    });

    it('pads to a full 32 bytes', () => {
        expect(commitmentHexOf(0n)).toBe('0x' + '00'.repeat(32));
        expect(commitmentHexOf(0xffn).length).toBe(66);
    });

    it('agrees with a plain toHex(bigintTo32Le(x))', () => {
        // The guarantee that matters: a caller comparing against a note's
        // own `commitmentHex` must get a match for the same commitment.
        const commitment = 0xdeadbeefn;
        expect(commitmentHexOf(commitment)).toBe(toHex(bigintTo32Le(commitment)));
    });
});
