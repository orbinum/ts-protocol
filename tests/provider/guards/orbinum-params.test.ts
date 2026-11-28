/**
 * The `window.orbinum` guards: what a page may send the wallet. Each refuses by shape
 * and size, before anything reaches the user.
 */
import { describe, expect, it } from 'vitest';
import {
    isOrbinumPrivateCallParams,
    isOrbinumPrivateTransferParams,
    isOrbinumRequestPermissionsParams,
    isOrbinumSignMessageParams,
    isOrbinumTransferParams,
    isPlanckString,
} from '../../../src/provider/guards/index';

const SS58 = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const EVM = '0x6f7262696e756d2f707269766174652d63616c6c';
const PRIV =
    'orbpriv3:0x0000000000000000000000000000000000000000000000000000000000000005:0x0707070707070707070707070707070707070707070707070707070707070707:09737e15';

describe('isPlanckString', () => {
    it('takes canonical decimals within u128', () => {
        expect(isPlanckString('0')).toBe(true);
        expect(isPlanckString('1500000000000000000')).toBe(true);
        expect(isPlanckString(((1n << 128n) - 1n).toString())).toBe(true);
    });

    it('refuses numbers, signs, leading zeros, decimals and u128 overflow', () => {
        for (const bad of [15, '-1', '01', '1.5', '1e18', '', ' 1', (1n << 128n).toString()]) {
            expect(isPlanckString(bad)).toBe(false);
        }
    });
});

describe('isOrbinumTransferParams', () => {
    it('takes an SS58 or 0x recipient and a positive amount', () => {
        expect(isOrbinumTransferParams({ to: SS58, value: '1' })).toBe(true);
        expect(isOrbinumTransferParams({ to: EVM, value: '1' })).toBe(true);
    });

    it('refuses zero, a malformed recipient, a private address', () => {
        expect(isOrbinumTransferParams({ to: SS58, value: '0' })).toBe(false);
        expect(isOrbinumTransferParams({ to: 'alice', value: '1' })).toBe(false);
        expect(isOrbinumTransferParams({ to: PRIV, value: '1' })).toBe(false);
        expect(isOrbinumTransferParams([SS58, '1'])).toBe(false);
    });
});

describe('isOrbinumPrivateTransferParams', () => {
    it('takes an orbpriv3 address only', () => {
        expect(isOrbinumPrivateTransferParams({ to: PRIV, value: '1' })).toBe(true);
        expect(isOrbinumPrivateTransferParams({ to: SS58, value: '1' })).toBe(false);
        expect(isOrbinumPrivateTransferParams({ to: PRIV.toUpperCase(), value: '1' })).toBe(false);
    });
});

describe('isOrbinumPrivateCallParams', () => {
    const step = { target: EVM, input: '0xa9059cbb', value: '10' };

    it('takes 1 to 8 steps whose values fit the amount', () => {
        expect(isOrbinumPrivateCallParams({ steps: [step], amount: '10', minReturn: '0' })).toBe(
            true
        );
        expect(
            isOrbinumPrivateCallParams({
                steps: Array.from({ length: 8 }, () => step),
                amount: '80',
                minReturn: '1',
            })
        ).toBe(true);
    });

    it('refuses what the runtime would refuse after taking the fee', () => {
        const base = { steps: [step], amount: '10', minReturn: '0' };
        expect(isOrbinumPrivateCallParams({ ...base, steps: [] })).toBe(false);
        expect(
            isOrbinumPrivateCallParams({ ...base, steps: Array.from({ length: 9 }, () => step) })
        ).toBe(false);
        expect(isOrbinumPrivateCallParams({ ...base, amount: '9' })).toBe(false);
        expect(isOrbinumPrivateCallParams({ ...base, amount: '0' })).toBe(false);
        const huge = { ...step, input: '0x' + '00'.repeat(16 * 1024 + 1) };
        expect(isOrbinumPrivateCallParams({ ...base, steps: [huge] })).toBe(false);
        expect(isOrbinumPrivateCallParams({ ...base, steps: [{ ...step, input: '0xabc' }] })).toBe(
            false
        );
    });
});

describe('isOrbinumSignMessageParams / isOrbinumRequestPermissionsParams', () => {
    it('bounds the message and requires text', () => {
        expect(isOrbinumSignMessageParams({ message: 'Sign in to example.org' })).toBe(true);
        expect(isOrbinumSignMessageParams({ message: '' })).toBe(false);
        expect(isOrbinumSignMessageParams({ message: 'x'.repeat(16 * 1024 + 1) })).toBe(false);
        // Multi-byte text is bounded by its UTF-8 size, not its length.
        expect(isOrbinumSignMessageParams({ message: '€'.repeat(6000) })).toBe(false);
    });

    it('asks for privacy explicitly', () => {
        expect(isOrbinumRequestPermissionsParams({ privacy: true })).toBe(true);
        expect(isOrbinumRequestPermissionsParams({ privacy: 'yes' })).toBe(false);
        expect(isOrbinumRequestPermissionsParams({})).toBe(false);
    });
});
