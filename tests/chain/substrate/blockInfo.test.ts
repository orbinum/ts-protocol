import { describe, it, expect } from 'vitest';
import { timestampFromExtrinsics } from '../../../src/chain/substrate/blockInfo';

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
