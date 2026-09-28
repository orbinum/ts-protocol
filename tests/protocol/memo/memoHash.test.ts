/**
 * memoHash — must reproduce the chain's memo digest byte for byte, or every v2
 * proof binds a hash the chain rejects.
 *
 * The vectors are shared with `node/frame/shielded-pool/src/operations/statement.rs`
 * (`memo_hash_matches_the_cross_repo_vectors`) and `@orbinum/wallet-sdk`.
 */
import { describe, it, expect } from 'vitest';
import { memoHash } from '../../../src/protocol/memo/memoHash';
import { bigintTo32Le } from '../../../src/foundation/encoding/bytes';
import { BN254_R } from '../../../src/foundation/crypto/constants';

const hex = (v: bigint) => Buffer.from(bigintTo32Le(v)).toString('hex');
const memo = (byte: number) => new Uint8Array(180).fill(byte);

describe('memoHash', () => {
    it('matches the chain for two output memos', () => {
        expect(hex(memoHash([memo(1), memo(2)]))).toBe(
            '978a2292588866b11afe6c88da581146b3c18d08932f6aeccf0ca27704871819'
        );
    });

    it('matches the chain for a total unshield (one empty change memo)', () => {
        expect(hex(memoHash([new Uint8Array(0)]))).toBe(
            '505e8bdcf453a9a8503ed771c10ed7dfe65cfad2a858ef471023a64084ba7223'
        );
    });

    it('accepts number[] memos, as the SDK stores them', () => {
        expect(memoHash([Array.from(memo(1)), Array.from(memo(2))])).toBe(
            memoHash([memo(1), memo(2)])
        );
    });

    it('moves with any byte, order or count change', () => {
        const base = memoHash([memo(1), memo(2)]);
        const tampered = memo(1);
        tampered[179] = 0;
        expect(memoHash([tampered, memo(2)])).not.toBe(base);
        expect(memoHash([memo(2), memo(1)])).not.toBe(base);
        expect(memoHash([memo(1)])).not.toBe(base);
    });

    it('is a canonical field element', () => {
        expect(memoHash([memo(0xff)]) < BN254_R).toBe(true);
    });
});
