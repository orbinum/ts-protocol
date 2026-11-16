import { describe, expect, it } from 'vitest';
import {
    classifyTxError,
    dispatchErrorPath,
    extractTxHash,
    parseModuleError,
} from '../../src/chain/txErrors';

describe('dispatchErrorPath', () => {
    it('reads a module error as Pallet.Error, skipping the Module wrapper', () => {
        const module = { type: 'Module', value: { type: 'Staking', value: { type: 'NotStash' } } };
        expect(dispatchErrorPath(module)).toBe('Staking.NotStash');
        expect(dispatchErrorPath({ dispatch_error: module, dispatch_info: {} })).toBe(
            'Staking.NotStash'
        );
    });

    it('reads other variants and bare names', () => {
        expect(dispatchErrorPath({ type: 'Token', value: { type: 'FundsUnavailable' } })).toBe(
            'Token.FundsUnavailable'
        );
        expect(dispatchErrorPath({ type: 'BadOrigin' })).toBe('BadOrigin');
        expect(dispatchErrorPath('BadOrigin')).toBe('BadOrigin');
        expect(dispatchErrorPath(null)).toBeNull();
        expect(dispatchErrorPath({ code: 1 })).toBeNull();
    });
});

describe('parseModuleError', () => {
    it('reads the pallet and the error of a submit failure', () => {
        expect(parseModuleError('Module(NominationPools.NotOpen)')).toEqual({
            pallet: 'NominationPools',
            error: 'NotOpen',
        });
        expect(parseModuleError('Other("x")')).toBeNull();
    });
});

describe('classifyTxError', () => {
    it('names the failures that come from no pallet', () => {
        expect(classifyTxError('Transaction dropped from the tx pool (not mined …)')).toBe(
            'dropped'
        );
        expect(classifyTxError('Transaction still pending after 90000ms: 0x…')).toBe('pending');
        expect(classifyTxError('1010: Invalid Transaction: Transaction is outdated')).toBe(
            'outdated'
        );
        expect(classifyTxError('Inability to pay some fees (e.g. account balance too low)')).toBe(
            'cannot-pay-fees'
        );
        expect(classifyTxError('Invalid Transaction: BadProof')).toBe('bad-signature');
        expect(classifyTxError('client destroyed')).toBe('disconnected');
        expect(classifyTxError('Module(Staking.NotStash)')).toBeNull();
    });

    it('extracts a transaction hash', () => {
        const hash = '0x' + 'ab'.repeat(32);
        expect(extractTxHash(`failed: ${hash}`)).toBe(hash);
        expect(extractTxHash('no hash')).toBeNull();
    });
});

describe('transactionFeePaid', () => {
    it('reads the fee by name, camelCased, positionally or through toJSON', async () => {
        const { transactionFeePaid } = await import('../../src/chain/tx');
        expect(transactionFeePaid({ who: 'x', actual_fee: 5n, tip: 0n })).toBe('5');
        expect(transactionFeePaid({ actualFee: '7' })).toBe('7');
        expect(transactionFeePaid(['x', 9, 0])).toBe('9');
        expect(transactionFeePaid({ toJSON: () => ({ actual_fee: 11 }) })).toBe('11');
        expect(transactionFeePaid({ who: 'x' })).toBeNull();
        expect(transactionFeePaid(null)).toBeNull();
    });
});
