/** Owner keys: only prime-subgroup points, and stealth ownership from the memo's secret. */
import { describe, expect, it } from 'vitest';
import { BN254_R } from '../../../../src';
import { isOwnedBy, ownerPkPoint, stealthOwnerPk } from '../../../../src/protocol/payment/owner';
import { KEY } from '../vectors';

describe('owner', () => {
    it('recovers the recipient’s owner point', () => {
        expect(ownerPkPoint(KEY.ownerPk)).not.toBeNull();
    });

    it('refuses zero, out-of-field and off-curve values', () => {
        for (const ax of [0n, -1n, BN254_R, BN254_R + 1n])
            expect(ownerPkPoint(ax), String(ax)).toBeNull();
        expect(ownerPkPoint(1 as never)).toBeNull();
        // About half of all x have no point on the curve: some small one is among them.
        const offCurve = Array.from({ length: 64 }, (_, i) => BigInt(i + 2)).filter(
            (ax) => ownerPkPoint(ax) === null
        );
        expect(offCurve.length).toBeGreaterThan(0);
    });

    it('owns a note named directly or through its stealth key, nothing else', () => {
        const point = ownerPkPoint(KEY.ownerPk)!;
        const secret = new Uint8Array(32).fill(9);
        const stealth = stealthOwnerPk(secret, KEY.ownerPk, point);
        expect(isOwnedBy(KEY.ownerPk, KEY.ownerPk, point, secret)).toBe(true);
        expect(isOwnedBy(stealth, KEY.ownerPk, point, secret)).toBe(true);
        expect(isOwnedBy(stealth, KEY.ownerPk, point, new Uint8Array(32).fill(8))).toBe(false);
        expect(isOwnedBy(stealth + 1n, KEY.ownerPk, point, secret)).toBe(false);
    });
});
