import { describe, expect, it } from 'vitest';
import { decodeSessionKeys } from '../../../../src/chain/pallet/staking/sessionKeys';
import {
    parseTransactionText,
    shieldTextLines,
} from '../../../../src/chain/substrate/ed25519Text/index';

describe('decodeSessionKeys', () => {
    it('splits Aura then GRANDPA, 32 bytes each', () => {
        const keys = '0x' + 'AA'.repeat(32) + 'bb'.repeat(32);
        expect(decodeSessionKeys(keys)).toEqual({
            aura: '0x' + 'aa'.repeat(32),
            grandpa: '0x' + 'bb'.repeat(32),
        });
        expect(decodeSessionKeys('0x' + 'aa'.repeat(32))).toBeNull();
        expect(decodeSessionKeys(null as never)).toBeNull();
    });
});

describe('transaction text, read back', () => {
    it('names the call and its lines up to the payload', () => {
        const text =
            'Orbinum transaction\nchain: 0x00\naction: Balances.transfer_keep_alive\nto: 0x01\namount: 1 ORB\npayload: 0xff';
        expect(parseTransactionText(text)).toEqual({
            action: 'Balances.transfer_keep_alive',
            lines: [
                ['to', '0x01'],
                ['amount', '1 ORB'],
            ],
        });
        expect(parseTransactionText('no action here')).toBeNull();
    });

    it('a shield shows its amount, commitment and memo lines', () => {
        const lines = shieldTextLines({
            amount: 10n ** 18n,
            commitment: new Uint8Array(32).fill(1),
            encryptedMemo: new Uint8Array(180),
        });
        expect(lines.map(([k]) => k)).toEqual(['amount', 'commitment', 'memo']);
        expect(lines[0]![1]).toBe('1 ORB');
    });
});
