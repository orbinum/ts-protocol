/** The `orbview1:` export and the key checks every entry point runs. */
import { describe, expect, it } from 'vitest';
import {
    decodeViewingKey,
    encodeViewingKey,
    readPaymentSlip,
} from '../../../../src/protocol/payment';
import { usableViewingKey } from '../../../../src/protocol/payment/viewingKey';
import { BN254_R } from '../../../../src';
import { KEY, vector } from '../vectors';

describe('orbview1', () => {
    it('round-trips into a key that reads the recipient’s slips', () => {
        const back = decodeViewingKey(encodeViewingKey(KEY))!;
        expect(back.ownerPk).toBe(KEY.ownerPk);
        expect([...back.viewingSecretKey]).toEqual([...KEY.viewingSecretKey]);
        expect(readPaymentSlip(vector('pseudonym').slip, back)).not.toBeNull();
        expect(decodeViewingKey(`  ${encodeViewingKey(KEY)}\n`)).not.toBeNull();
    });

    it('refuses a mistyped, foreign, malformed or oversized string', () => {
        const text = encodeViewingKey(KEY);
        const flipped = text.slice(0, -1) + (text.endsWith('0') ? '1' : '0');
        for (const bad of [
            flipped,
            text.replace('orbview1:', 'orbview2:'),
            `${text}:extra`,
            'orbview1:0x00:0x00:00000000',
            'orbview1:',
            text + ' '.repeat(500),
            '',
        ]) {
            expect(decodeViewingKey(bad), bad.slice(0, 30)).toBeNull();
        }
        expect(decodeViewingKey(42 as never)).toBeNull();
    });

    it('a key that cannot be one is a wiring error, refused loudly', () => {
        for (const key of [
            { ...KEY, viewingSecretKey: new Uint8Array(32) },
            { ...KEY, viewingSecretKey: new Uint8Array(16).fill(1) },
            { ...KEY, viewingSecretKey: [...KEY.viewingSecretKey] as never },
            { ...KEY, ownerPk: 0n },
            { ...KEY, ownerPk: BN254_R },
            { ...KEY, ownerPk: Number(1) as never },
        ]) {
            expect(() => usableViewingKey(key)).toThrow(TypeError);
            expect(() => encodeViewingKey(key)).toThrow(TypeError);
        }
    });
});
