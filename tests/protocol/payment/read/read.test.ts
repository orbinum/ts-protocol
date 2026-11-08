/** readPaymentSlip gives the wallet's answer for every reference vector. */
import { describe, expect, it } from 'vitest';
import { readPaymentSlip } from '../../../../src/protocol/payment';
import { KEY, VECTORS } from '../vectors';

describe('readPaymentSlip — same answers as the wallet', () => {
    for (const v of VECTORS) {
        it(v.name, () => {
            const payment = readPaymentSlip(v.slip, KEY);
            if (!v.expected) {
                expect(payment).toBeNull();
                return;
            }
            expect(payment).toMatchObject({
                commitmentHex: v.expected.commitmentHex,
                value: BigInt(v.expected.value),
                assetId: BigInt(v.expected.assetId),
            });
            expect(payment!.leafIndex).toBe(v.expected.leafIndex);
            expect(payment!.txHash).toBe(v.expected.txHash);
            if (v.expected.senderAddress) {
                expect(payment!.sender).toEqual({
                    kind: 'address',
                    address: v.expected.senderAddress,
                });
            } else if (v.name === 'pseudonym') {
                expect(payment!.sender).toEqual({ kind: 'pseudonym', name: 'CoffeeShop' });
            } else {
                expect(payment!.sender).toEqual({ kind: 'anonymous' });
            }
        });
    }

    it('accepts surrounding whitespace, as a pasted slip carries', () => {
        expect(readPaymentSlip(`  ${VECTORS[0]!.slip}\n`, KEY)).not.toBeNull();
    });
});
