import { describe, it, expect, vi } from 'vitest';
import { isServerBusyError, withBusyRetry, SERVER_BUSY_CODE } from '../../../src/chain/rpc/busy';

const busy = () =>
    Object.assign(new Error('Merkle proof queue is full, try again later'), {
        code: SERVER_BUSY_CODE,
    });
const noSleep = { sleep: vi.fn(async () => {}) };

describe('isServerBusyError', () => {
    it('recognises the code, and the wording when the code was lost', () => {
        expect(isServerBusyError({ code: -32009, message: 'anything' })).toBe(true);
        expect(isServerBusyError(new Error('Merkle proof queue is full, try again later'))).toBe(
            true
        );
        expect(isServerBusyError('Too many Merkle proofs in flight, try again later')).toBe(true);
    });

    it('is false for anything else', () => {
        for (const e of [
            new Error('commitment not found'),
            { code: -32602 },
            null,
            undefined,
            42,
            {},
        ]) {
            expect(isServerBusyError(e)).toBe(false);
        }
    });
});

describe('withBusyRetry', () => {
    it('retries while busy and returns the first success', async () => {
        const request = vi
            .fn()
            .mockRejectedValueOnce(busy())
            .mockRejectedValueOnce(busy())
            .mockResolvedValue('ok');
        await expect(withBusyRetry(request, noSleep)).resolves.toBe('ok');
        expect(request).toHaveBeenCalledTimes(3);
    });

    it('never retries another error', async () => {
        const request = vi.fn().mockRejectedValue(new Error('commitment not found'));
        await expect(withBusyRetry(request, noSleep)).rejects.toThrow('commitment not found');
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('gives up after the last attempt with the busy error', async () => {
        const request = vi.fn().mockRejectedValue(busy());
        await expect(withBusyRetry(request, { ...noSleep, attempts: 3 })).rejects.toMatchObject({
            code: SERVER_BUSY_CODE,
        });
        expect(request).toHaveBeenCalledTimes(3);
    });

    it('backs off, doubling with bounded jitter', async () => {
        const sleep = vi.fn(async (_ms: number) => {});
        const request = vi
            .fn()
            .mockRejectedValueOnce(busy())
            .mockRejectedValueOnce(busy())
            .mockResolvedValue(1);
        await withBusyRetry(request, { sleep, baseDelayMs: 100 });
        const [first, second] = sleep.mock.calls.map(([ms]) => ms);
        expect(first).toBeGreaterThanOrEqual(100);
        expect(first).toBeLessThanOrEqual(150);
        expect(second).toBeGreaterThanOrEqual(200);
        expect(second).toBeLessThanOrEqual(300);
    });
});
