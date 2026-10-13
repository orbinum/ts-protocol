import { describe, it, expect } from 'vitest';
import {
    decodePaymentSlip,
    encodePaymentSlip,
    PAYMENT_SLIP_SCHEME,
} from '../../../src/protocol/memo/index';

describe('payment slip wire format', () => {
    it('round-trips a maximum-size envelope', () => {
        const envelope = new Uint8Array(4096).fill(7);
        expect(decodePaymentSlip(encodePaymentSlip(envelope))).toEqual(envelope);
    });

    it('refuses an oversized string before hashing it', () => {
        expect(
            decodePaymentSlip(PAYMENT_SLIP_SCHEME + 'A'.repeat(1_000_000) + ':00000000')
        ).toBeNull();
    });
});
