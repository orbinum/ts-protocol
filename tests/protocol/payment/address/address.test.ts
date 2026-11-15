/** The recipient's public `orbpriv3:` address, as a proof verifier decodes it. */
import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { toHex } from '../../../../src';
import { decodePaymentAddress } from '../../../../src/protocol/payment';
import { BN254_R } from '../../../../src/foundation/crypto/constants';
import { ADDRESS } from '../vectors';

const withChecksum = (body: string) =>
    `${body}:${toHex(sha256(new TextEncoder().encode(body)).slice(0, 4)).slice(2)}`;
const [ownerHex, ivkHex] = ADDRESS.split(':').slice(1, 3) as [string, string];

describe('decodePaymentAddress', () => {
    it('decodes a real address with its points', () => {
        const address = decodePaymentAddress(ADDRESS)!;
        expect(address.ownerPk).toBe(BigInt(ownerHex));
        expect(address.ownerPoint[0]).toBe(address.ownerPk);
        expect(address.viewingKey).toHaveLength(2);
    });

    it('refuses a mistyped address', () => {
        expect(
            decodePaymentAddress(ADDRESS.slice(0, -1) + (ADDRESS.endsWith('0') ? '1' : '0'))
        ).toBeNull();
        expect(decodePaymentAddress(ADDRESS.replace('orbpriv3:', 'orbpriv2:'))).toBeNull();
    });

    it('refuses keys no wallet could hold, even with a valid checksum', () => {
        const offCurve = '0x' + BN254_R.toString(16).padStart(64, '0');
        expect(decodePaymentAddress(withChecksum(`orbpriv3:${offCurve}:${ivkHex}`))).toBeNull();
        // The identity point packs to zero: low order, the ECDH would be public.
        expect(
            decodePaymentAddress(withChecksum(`orbpriv3:${ownerHex}:0x${'00'.repeat(32)}`))
        ).toBeNull();
    });

    it('refuses non-strings and oversized input', () => {
        for (const bad of [undefined, null, 1, {}, `${ADDRESS}${' '.repeat(300)}`]) {
            expect(decodePaymentAddress(bad as never)).toBeNull();
        }
    });
});
