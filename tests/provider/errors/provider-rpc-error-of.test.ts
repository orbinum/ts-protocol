import { describe, expect, it } from 'vitest';
import {
    PROVIDER_ERROR_CODES,
    ProviderRpcError,
    providerRpcErrorOf,
} from '../../../src/provider/errors/index';

describe('providerRpcErrorOf', () => {
    it('reads the class, and the plain shape a message channel delivers', () => {
        const thrown = new ProviderRpcError(PROVIDER_ERROR_CODES.userRejected, 'rejected');
        expect(providerRpcErrorOf(thrown)).toBe(thrown);
        const crossed = providerRpcErrorOf(structuredClone(thrown.toShape()));
        expect(crossed).toBeInstanceOf(ProviderRpcError);
        expect(crossed?.code).toBe(4001);
        expect(crossed?.message).toBe('rejected');
    });

    it('is null for anything else', () => {
        for (const other of [
            new Error('x'),
            null,
            'x',
            { code: '4001', message: 'x' },
            { code: 1.5, message: '' },
        ]) {
            expect(providerRpcErrorOf(other)).toBeNull();
        }
    });

    it('keeps data across the channel only when there is some', () => {
        expect(new ProviderRpcError(-32602, 'bad').toShape()).toEqual({
            code: -32602,
            message: 'bad',
        });
        expect(new ProviderRpcError(-32603, 'x', { at: 'sign' }).toShape().data).toEqual({
            at: 'sign',
        });
    });
});
