/** The `orbproof1:` codec: strict on what it accepts, canonical in what it returns. */
import { describe, expect, it } from 'vitest';
import {
    decodePaymentProof,
    encodePaymentProof,
    PAYMENT_PROOF_SCHEME,
} from '../../../../src/protocol/payment';
import { proofVector } from '../vectors';

const text = proofVector('anonymous').proof;
const fields = decodePaymentProof(text)!;

describe('payment proof codec', () => {
    it('round-trips', () => {
        expect(text.startsWith(PAYMENT_PROOF_SCHEME)).toBe(true);
        expect(encodePaymentProof(fields)).toBe(text);
        expect(decodePaymentProof(`  ${text}\n`)).toEqual(fields);
    });

    it('returns lowercase hex, so one payment has one commitment to deduplicate by', () => {
        const upper = {
            ...fields,
            commitmentHex: '0x' + fields.commitmentHex.slice(2).toUpperCase(),
        };
        expect(decodePaymentProof(encodePaymentProof(upper))!.commitmentHex).toBe(
            fields.commitmentHex
        );
    });

    it('refuses a mistyped or truncated proof (checksum)', () => {
        const i = text.indexOf(':') + 10;
        const typo = text.slice(0, i) + (text[i] === 'a' ? 'b' : 'a') + text.slice(i + 1);
        expect(decodePaymentProof(typo)).toBeNull();
        expect(decodePaymentProof(text.slice(0, -1))).toBeNull();
        expect(decodePaymentProof(text.replace(/:[0-9a-f]{8}$/, ''))).toBeNull();
    });

    it('refuses wrong field sizes, counts and schemes', () => {
        expect(() => encodePaymentProof({ ...fields, ephemeralSecretKey: '0x01' })).toThrow(
            TypeError
        );
        expect(() =>
            encodePaymentProof({ ...fields, encryptedMemo: '0x' + '00'.repeat(179) })
        ).toThrow(TypeError);
        expect(decodePaymentProof(text.replace(PAYMENT_PROOF_SCHEME, 'orbproof2:'))).toBeNull();
        expect(
            decodePaymentProof(text.replace(PAYMENT_PROOF_SCHEME, `${PAYMENT_PROOF_SCHEME}0x00:`))
        ).toBeNull();
    });

    it('refuses non-strings and oversized input before parsing', () => {
        for (const bad of [undefined, null, 42, {}, [], `${text}${'0'.repeat(2000)}`]) {
            expect(decodePaymentProof(bad as never)).toBeNull();
        }
    });
});
