import { describe, it, expect, vi } from 'vitest';
import { PRIVATE_CALL_EXECUTOR } from '../../../src/protocol/bound/index';
import {
    estimatePrivateCallGas,
    simulatePrivateCall,
} from '../../../src/chain/evm/privateCall/index';
import type { EvmClient } from '../../../src/chain/evm/EvmClient';

const target = '0x' + 'aa'.repeat(20);

describe('simulatePrivateCall', () => {
    it('calls each step from the executor holding the amount, and reports reverts', async () => {
        const request = vi
            .fn()
            .mockResolvedValueOnce('0x01')
            .mockRejectedValueOnce(new Error('EVM RPC [3]: execution reverted'));
        const evm = { request } as unknown as EvmClient;
        const steps = [
            { target, input: Uint8Array.from([1]), value: 2n },
            { target, input: new Uint8Array(), value: 0n },
        ];
        const results = await simulatePrivateCall(evm, steps, 10n);
        expect(results).toEqual([
            { ok: true, returnData: '0x01' },
            { ok: false, error: 'EVM RPC [3]: execution reverted' },
        ]);
        expect(request.mock.calls[0]).toEqual([
            'eth_call',
            [
                { from: PRIVATE_CALL_EXECUTOR, to: target, data: '0x01', value: '0x2' },
                'latest',
                { [PRIVATE_CALL_EXECUTOR]: { balance: '0xa' } },
            ],
        ]);
    });
});

describe('estimatePrivateCallGas', () => {
    it('finds the least gas each step succeeds with, from the executor holding the amount', async () => {
        const needs = [50_000n, 300_000n];
        const request = vi.fn(async (_method: string, params: unknown[]) => {
            const tx = params[0] as { to: string; gas: string };
            const need = tx.to === target ? needs[0]! : needs[1]!;
            if (BigInt(tx.gas) < need) throw new Error('out of gas');
            return '0x';
        });
        const evm = { request } as unknown as EvmClient;
        const other = '0x' + 'bb'.repeat(20);
        const steps = [
            { target, input: new Uint8Array(), value: 1n },
            { target: other, input: new Uint8Array(), value: 0n },
        ];
        const gas = await estimatePrivateCallGas(evm, steps, 10n);
        gas.forEach((g, i) => {
            if (!g.ok) throw new Error(g.error);
            expect(g.gas).toBeGreaterThanOrEqual(needs[i]!);
            expect(g.gas).toBeLessThanOrEqual(needs[i]! + needs[i]! / 32n);
        });
        const [, [tx, block, override]] = request.mock.calls[0]!;
        expect(tx).toMatchObject({ from: PRIVATE_CALL_EXECUTOR, gas: '0x11e1a30' });
        expect([block, override]).toEqual([
            'latest',
            { [PRIVATE_CALL_EXECUTOR]: { balance: '0xa' } },
        ]);
    });

    it('reports a step that fails even with the most gas', async () => {
        const evm = {
            request: vi.fn().mockRejectedValue(new Error('execution reverted')),
        } as unknown as EvmClient;
        const steps = [{ target, input: new Uint8Array(), value: 0n }];
        expect(await estimatePrivateCallGas(evm, steps, 0n)).toEqual([
            { ok: false, error: 'execution reverted' },
        ]);
    });
});
