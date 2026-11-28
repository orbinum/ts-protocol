import { describe, expect, it } from 'vitest';
import {
    isEthSendTransactionParams,
    isPersonalSignParams,
    isSignTypedDataV4Params,
    isSwitchChainParams,
} from '../../../src/provider/guards/index';

const FROM = '0x2c7536e3605d9c16a7a3d7b1898e529396a65c23';

describe('isEthSendTransactionParams', () => {
    it('takes a call, a deploy, and legacy or EIP-1559 pricing', () => {
        expect(
            isEthSendTransactionParams([{ from: FROM, to: FROM, value: '0x1', data: '0x' }])
        ).toBe(true);
        expect(isEthSendTransactionParams([{ from: FROM, data: '0x6080' }])).toBe(true);
        expect(isEthSendTransactionParams([{ from: FROM, to: FROM, gasPrice: '0x3b9aca00' }])).toBe(
            true
        );
        expect(
            isEthSendTransactionParams([
                { from: FROM, to: FROM, maxFeePerGas: '0x1', gas: '0x5208' },
            ])
        ).toBe(true);
    });

    it('refuses a missing sender, malformed fields, or two calldatas that disagree', () => {
        expect(isEthSendTransactionParams([{ to: FROM }])).toBe(false);
        expect(isEthSendTransactionParams([{ from: FROM, value: 1 }])).toBe(false);
        expect(isEthSendTransactionParams([{ from: FROM, data: '0xabc' }])).toBe(false);
        expect(isEthSendTransactionParams([{ from: FROM, data: '0x01', input: '0x02' }])).toBe(
            false
        );
        expect(isEthSendTransactionParams({ from: FROM })).toBe(false);
    });
});

describe('isPersonalSignParams / isSignTypedDataV4Params / isSwitchChainParams', () => {
    it('reads personal_sign as [message, address]', () => {
        expect(isPersonalSignParams(['0x68656c6c6f', FROM])).toBe(true);
        expect(isPersonalSignParams([FROM])).toBe(false);
    });

    it('takes typed data as JSON or an object, with the four members', () => {
        const typed = { types: {}, primaryType: 'Mail', domain: {}, message: {} };
        expect(isSignTypedDataV4Params([FROM, JSON.stringify(typed)])).toBe(true);
        expect(isSignTypedDataV4Params([FROM, typed])).toBe(true);
        expect(isSignTypedDataV4Params([FROM, '{not json'])).toBe(false);
        expect(isSignTypedDataV4Params([FROM, { types: {} }])).toBe(false);
    });

    it('takes a hex chain id', () => {
        expect(isSwitchChainParams([{ chainId: '0xa8c' }])).toBe(true);
        expect(isSwitchChainParams([{ chainId: 2700 }])).toBe(false);
    });
});
