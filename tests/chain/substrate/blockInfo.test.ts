import { describe, it, expect } from 'vitest';
import {
    auraSlot,
    authorFromSlot,
    timestampFromExtrinsics,
} from '../../../src/chain/substrate/blockInfo';

/** `Compact(len) || version || Timestamp(1) || set(0) || Compact<u64>`. */
const timestampSet = (compact: string) => '0x' + '28' + '04' + '01' + '00' + compact;

describe('timestampFromExtrinsics', () => {
    it('reads the compact u64 of timestamp.set', () => {
        // 1_700_000_000_000 as a big-integer compact: 6 bytes → (6 - 4) << 2 | 0b11 = 0x0b.
        const ms = 1_700_000_000_000;
        const le = ms.toString(16).padStart(12, '0').match(/../g)!.reverse().join('');
        expect(timestampFromExtrinsics(['0x0400', timestampSet('0b' + le)])).toBe(ms);
    });

    it('skips extrinsics of other pallets', () => {
        expect(timestampFromExtrinsics(['0x28040200' + '00'])).toBeNull();
    });

    it('stops at the timestamp call even when it reads zero', () => {
        expect(timestampFromExtrinsics([timestampSet('00'), timestampSet('0400')])).toBeNull();
    });

    it('survives malformed hex', () => {
        expect(timestampFromExtrinsics(['0xzz', '0x'])).toBeNull();
    });
});

describe('Aura authorship', () => {
    // 06 PreRuntime ‖ "aura" ‖ compact(8) ‖ slot 0x0102 LE.
    const AURA = '0x066175726120' + '0201000000000000';

    it('reads the slot from the Aura pre-runtime digest', () => {
        expect(auraSlot(['0x0561757261aa', AURA])).toBe(258n);
        expect(auraSlot(['0x0662616265' + '00'.repeat(40)])).toBeNull(); // Babe: not ours
        expect(auraSlot([])).toBeNull();
    });

    it('the author is the validator the slot falls on, round-robin', () => {
        expect(authorFromSlot(258n, ['A', 'B', 'C'])).toBe('A'); // 258 % 3 = 0
        expect(authorFromSlot(259n, ['A', 'B', 'C'])).toBe('B');
        expect(authorFromSlot(258n, [])).toBeNull();
        expect(authorFromSlot(null, ['A'])).toBeNull();
    });
});
