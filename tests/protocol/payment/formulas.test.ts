/** The shared formulas a wallet imports: each one agrees with what it composes. */
import { describe, expect, it } from 'vitest';
import { Base8, addPoint, mulPointEscalar } from '@zk-kit/baby-jubjub';
import {
    memoEphPk,
    memoViewTag,
    memoViewTagMatches,
    ownerPkPoint,
    stealthOwnerPk,
    stealthScalar,
} from '../../../src/protocol/payment';
import { ENCRYPTED_MEMO_SIZE } from '../../../src/protocol/memo/memoFormat';

const SECRET = new Uint8Array(32).fill(7);

describe('stealth keys', () => {
    it('the owner key is the stealth scalar added to the base point', () => {
        const owner = mulPointEscalar(Base8, 12345n);
        const point = ownerPkPoint(owner[0])!;
        const scalar = stealthScalar(SECRET, owner[0]);
        expect(stealthOwnerPk(SECRET, owner[0], point)).toBe(
            addPoint(mulPointEscalar(Base8, scalar), point)[0]
        );
    });
});

describe('memo layout', () => {
    it('publishes the ephemeral key in its last 32 bytes', () => {
        const memo = new Uint8Array(ENCRYPTED_MEMO_SIZE).map((_, i) => i & 0xff);
        expect(memoEphPk(memo)).toEqual(memo.slice(ENCRYPTED_MEMO_SIZE - 32));
        expect(memoEphPk(memo.slice(1))).toBeNull();
    });

    it('carries the view tag in its first byte', () => {
        const memo = new Uint8Array(ENCRYPTED_MEMO_SIZE);
        memo[0] = memoViewTag(SECRET);
        expect(memoViewTagMatches(memo, SECRET)).toBe(true);
        memo[0] ^= 1;
        expect(memoViewTagMatches(memo, SECRET)).toBe(false);
    });
});
