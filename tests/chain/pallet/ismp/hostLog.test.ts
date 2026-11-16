import { describe, expect, it } from 'vitest';
import { keccakAsHex } from '@polkadot/util-crypto';
import {
    POST_REQUEST_HANDLED_TOPIC,
    postRequestHandledRelayer,
} from '../../../../src/chain/pallet/ismp/hostLog';

describe('ISMP host delivery log', () => {
    it('topic 0 is keccak256 of the event signature', () => {
        expect(POST_REQUEST_HANDLED_TOPIC).toBe(keccakAsHex('PostRequestHandled(bytes32,address)'));
    });

    it('reads the relayer right-aligned in the data word', () => {
        const relayer = 'ab'.repeat(20);
        expect(postRequestHandledRelayer('0x' + '00'.repeat(12) + relayer)).toBe('0x' + relayer);
        expect(postRequestHandledRelayer('0x1234')).toBeNull();
    });
});
