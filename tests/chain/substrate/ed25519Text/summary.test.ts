/**
 * The summary must render what the runtime renders, or the signature is a `BadProof`:
 * unit cases per call, then the runtime's own vectors byte for byte.
 */
import { describe, it, expect } from 'vitest';
import { concatBytes } from '@noble/hashes/utils.js';
import { compactBn, u128, u32 } from '@polkadot-api/substrate-bindings';
import { fromHex, toHex } from '../../../../src/foundation/encoding/hex';
import { textMessage } from '../../../../src/chain/substrate/ed25519Text/message';
import { formatOrb, summaryLines } from '../../../../src/chain/substrate/ed25519Text/summary';
import { VECTORS, nameOf } from './fixtures';

const ORB = 10n ** 18n;
const BOB = fromHex('0x' + 'b0'.repeat(32));

const transfer = (index: number, value: bigint) =>
    concatBytes(Uint8Array.of(0x04, index), BOB, compactBn.enc(value));
const shieldedPool = (index: number, asset: number, amount: bigint, rest = new Uint8Array()) =>
    concatBytes(Uint8Array.of(0x0d, index), u32.enc(asset), u128.enc(amount), rest);
const summary = (call: Uint8Array, tip = 0n) => summaryLines(call, nameOf(call), tip);

describe('formatOrb', () => {
    it.each([
        [0n, '0 ORB'],
        [1n, '0.000000000000000001 ORB'],
        [ORB / 100n, '0.01 ORB'],
        [(3n * ORB) / 2n, '1.5 ORB'],
        [2n * ORB, '2 ORB'],
        [ORB + 1n, '1.000000000000000001 ORB'],
        [2n ** 128n - 1n, '340282366920938463463.374607431768211455 ORB'],
    ])('%s planck is %s', (amount, text) => {
        expect(formatOrb(amount)).toBe(text);
    });
});

describe('summaryLines', () => {
    it('shows a transfer’s recipient and amount', () => {
        expect(summary(transfer(3, (3n * ORB) / 2n))).toBe(
            `Balances.transfer_keep_alive\nto: ${toHex(BOB)}\namount: 1.5 ORB`
        );
        expect(summary(transfer(0, 1n))).toBe(
            `Balances.transfer_allow_death\nto: ${toHex(BOB)}\namount: 0.000000000000000001 ORB`
        );
    });

    it('shows all for transfer_all', () => {
        const call = concatBytes(Uint8Array.of(0x04, 0x04), BOB, Uint8Array.of(0));
        expect(summary(call)).toBe(`Balances.transfer_all\nto: ${toHex(BOB)}\namount: all`);
    });

    it('shows the amount of ORB shields and fee claims, not of other assets', () => {
        const proof = new Uint8Array(300).fill(0x9f);
        expect(summary(shieldedPool(0x00, 0, 2n * ORB, proof))).toBe(
            'ShieldedPool.shield\namount: 2 ORB'
        );
        expect(summary(shieldedPool(0x13, 0, ORB / 4n))).toBe(
            'ShieldedPool.claim_fees\namount: 0.25 ORB'
        );
        expect(summary(shieldedPool(0x00, 7, 5n, proof))).toBe('ShieldedPool.shield');
        expect(summary(shieldedPool(0x13, 7, 5n))).toBe('ShieldedPool.claim_fees');
    });

    it('shows other calls by name only', () => {
        expect(summary(Uint8Array.of(0, 0, 4, 1))).toBe('System.remark');
    });

    it('adds the tip last, only when it is not zero', () => {
        expect(summary(transfer(3, ORB), ORB / 100n)).toMatch(/\namount: 1 ORB\ntip: 0\.01 ORB$/);
        expect(summary(transfer(3, ORB), 0n)).not.toContain('tip:');
    });

    it('shows unknown for bytes the metadata does not name', () => {
        expect(summaryLines(Uint8Array.of(0xff, 0xff), null, 5n)).toBe('unknown');
    });
});

describe('the runtime vectors', () => {
    it.each(VECTORS.vectors)('$name renders the runtime text', (v) => {
        const call = fromHex(v.call);
        const text = textMessage(
            fromHex(v.payload),
            fromHex(VECTORS.genesis),
            summaryLines(call, nameOf(call), BigInt(v.tip))
        );
        expect(new TextDecoder().decode(text)).toBe(v.text);
    });

    it('include a shield and a payload over 256 bytes', () => {
        const shield = VECTORS.vectors.find((v) => v.name === 'shield');
        expect(fromHex(shield?.payload ?? '0x').length).toBeGreaterThan(256);
        expect(VECTORS.vectors.map((v) => v.name)).toContain('remark_over_256_bytes');
    });
});
