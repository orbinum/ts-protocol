/** Opening a memo: bound to its commitment, its key and its size. */
import { describe, expect, it } from 'vitest';
import { decodePaymentSlip, fromHex, openPaymentSlip } from '../../../../src';
import {
    memoSharedSecret,
    memoViewTagMatches,
    openMemo,
} from '../../../../src/protocol/payment/memo';
import { KEY, vector } from '../vectors';

const fields = openPaymentSlip(KEY.viewingSecretKey, decodePaymentSlip(vector('anonymous').slip)!)!;
const memo = fromHex(fields.encryptedMemo);
const commitment = fromHex(fields.commitmentHex);

describe('memo', () => {
    it('opens with the right secret and commitment', () => {
        const secret = memoSharedSecret(memo, KEY.viewingSecretKey)!;
        expect(memoViewTagMatches(memo, secret)).toBe(true);
        expect(openMemo(memo, commitment, secret)).toMatchObject({ value: 4200n, assetId: 0n });
    });

    it('a memo lifted onto another commitment does not open', () => {
        const secret = memoSharedSecret(memo, KEY.viewingSecretKey)!;
        const other = commitment.slice();
        other[0]! ^= 1;
        expect(openMemo(memo, other, secret)).toBeNull();
    });

    it('another viewing key derives another secret, and the memo does not open', () => {
        const wrongKey = KEY.viewingSecretKey.slice();
        wrongKey[5]! ^= 0xff;
        const secret = memoSharedSecret(memo, wrongKey)!;
        expect(openMemo(memo, commitment, secret)).toBeNull();
    });

    it('wrong sizes are refused without throwing', () => {
        const secret = memoSharedSecret(memo, KEY.viewingSecretKey)!;
        expect(memoSharedSecret(memo.subarray(1), KEY.viewingSecretKey)).toBeNull();
        expect(memoViewTagMatches(memo.subarray(1), secret)).toBe(false);
        expect(openMemo(memo.subarray(1), commitment, secret)).toBeNull();
        expect(openMemo(memo, commitment.subarray(1), secret)).toBeNull();
        expect(openMemo(memo, commitment, secret.subarray(1))).toBeNull();
    });

    it('an ephemeral key outside the prime subgroup gives no secret', () => {
        const forged = memo.slice();
        forged.fill(0, 148);
        forged[148] = 1; // packed point (0, 1)… is the identity; any small-order key is refused
        expect(memoSharedSecret(forged, KEY.viewingSecretKey)).toBeNull();
    });
});
