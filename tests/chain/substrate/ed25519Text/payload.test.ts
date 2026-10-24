/** The signing payload rebuilt from the pjs JSON must be the bytes the runtime verifies. */
import { describe, it, expect } from 'vitest';
import { fromHex, toHex } from '../../../../src/foundation/encoding/hex';
import { signingPayload } from '../../../../src/chain/substrate/ed25519Text/payload';
import { GENESIS, SHORT_PAYLOAD, pjs, remark } from './fixtures';

describe('signingPayload', () => {
    it('rebuilds the runtime signing payload from the pjs JSON', () => {
        expect(toHex(signingPayload(pjs(remark('orbinum solana probe'))))).toBe(SHORT_PAYLOAD);
    });

    it('keeps a payload over 256 bytes whole', () => {
        expect(signingPayload(pjs(remark('x'.repeat(300)))).length).toBe(381);
    });

    it('signs the metadata hash when CheckMetadataHash is enabled (Ledger)', () => {
        const hash = '0x' + '11'.repeat(32);
        const p = { ...pjs(remark('orbinum solana probe')), mode: 1, metadataHash: hash };
        const short = fromHex(SHORT_PAYLOAD);
        const payload = signingPayload(p);
        // Call (23 bytes), era, nonce and tip (1 byte each), then the mode byte; and
        // `Some(hash)` instead of `None` at the end.
        expect(payload[23 + 1 + 1 + 1]).toBe(1);
        expect(short[23 + 1 + 1 + 1]).toBe(0);
        expect(toHex(payload.slice(-33))).toBe('0x01' + '11'.repeat(32));
        expect(payload.length).toBe(short.length + 32);
    });

    it('encodes the tip, nonce and versions the runtime signs', () => {
        const p = {
            ...pjs(remark('a')),
            nonce: '0x00000005',
            tip: '0x' + (10n ** 16n).toString(16).padStart(32, '0'),
            specVersion: '0x00000014',
        };
        const payload = signingPayload(p);
        // remark('a'): 2 indices + compact length + 1 byte = 4 bytes, then the immortal era.
        expect(toHex(payload.slice(4, 5))).toBe('0x00');
        expect(toHex(payload.slice(5, 6))).toBe('0x14'); // compact(5)
        expect(toHex(payload.slice(6, 14))).toBe('0x0f0000c16ff28623'); // compact(1e16)
        expect(toHex(payload.slice(15, 19))).toBe('0x14000000'); // spec 20
        expect(toHex(payload.slice(23, 55))).toBe(GENESIS);
    });

    it('refuses extensions the runtime does not sign', () => {
        const p = pjs(remark('a'));
        p.signedExtensions = [...p.signedExtensions, 'ChargeAssetTxPayment'];
        expect(() => signingPayload(p)).toThrow(/Unexpected signed extensions/);
    });
});
