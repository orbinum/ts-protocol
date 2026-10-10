/**
 * bjj — viewing-key validation. `unpackUsableViewingKey` is the cheap gate the
 * scan applies to ephemeral keys; `unpackSubgroupViewingKey` is the full check
 * a recipient key must pass. A mixed-order key is exactly where they differ.
 */
import { describe, it, expect } from 'vitest';
import { addPoint, Base8, mulPointEscalar, packPoint } from '@zk-kit/baby-jubjub';
import {
    unpackSubgroupViewingKey,
    unpackUsableViewingKey,
} from '../../../src/foundation/crypto/bjj';
import { isInPrimeSubgroup } from '../../../src/foundation/crypto/bjj-fast';
import { BN254_R } from '../../../src/foundation/crypto/constants';
import { bigintTo32Le } from '../../../src/foundation/encoding/bytes';
import { sealPaymentSlip } from '../../../src/protocol/memo/PaymentSlip';

const K = 123456789012345678901234567890n;
const P = mulPointEscalar(Base8, K);
/** (0, -1): the order-2 point. */
const ORDER_2: [bigint, bigint] = [0n, BN254_R - 1n];
const MIXED = addPoint(P, ORDER_2);

const realKey = packPoint(P);
const mixedKey = packPoint(MIXED);

describe('unpackSubgroupViewingKey', () => {
    it('rejects a mixed-order key that unpackUsableViewingKey accepts', () => {
        expect(unpackUsableViewingKey(mixedKey)).toEqual(MIXED);
        expect(unpackSubgroupViewingKey(mixedKey)).toBeNull();
        expect(isInPrimeSubgroup(MIXED)).toBe(false);
    });

    it('accepts a real key (Base8·k), as does unpackUsableViewingKey', () => {
        expect(unpackUsableViewingKey(realKey)).toEqual(P);
        expect(unpackSubgroupViewingKey(realKey)).toEqual(P);
        expect(isInPrimeSubgroup(P)).toBe(true);
    });

    it('rejects the identity and small-order keys under both', () => {
        const identity = packPoint([0n, 1n]);
        for (const packed of [identity, packPoint(ORDER_2), 0n]) {
            expect(unpackUsableViewingKey(packed)).toBeNull();
            expect(unpackSubgroupViewingKey(packed)).toBeNull();
        }
    });
});

describe('sealPaymentSlip recipient key', () => {
    const fields = {
        commitmentHex: '0x' + '11'.repeat(32),
        encryptedMemo: '0x' + '22'.repeat(180),
    };

    it('throws when sealing to a mixed-order viewing key', () => {
        expect(() => sealPaymentSlip(bigintTo32Le(mixedKey), fields)).toThrow(
            'invalid recipient viewing public key'
        );
    });

    it('seals to a prime-subgroup viewing key', () => {
        expect(sealPaymentSlip(bigintTo32Le(realKey), fields).length).toBeGreaterThan(40);
    });
});
