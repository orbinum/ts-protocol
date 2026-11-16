import { describe, expect, it, vi } from 'vitest';
import { BalancesModule } from '../../../../src/chain/pallet/balances/BalancesModule';

const ALICE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';

function client(account: unknown) {
    const transfer = vi.fn((args: unknown) => ({
        decodedCall: { type: 'Balances', value: { type: 'transfer_keep_alive', value: args } },
        createAndSubmit: async () => ({
            txHash: '0x1',
            block: { hash: '0x2', number: 3 },
            ok: true,
        }),
    }));
    const substrate = {
        unsafe: {
            query: { System: { Account: { getValue: vi.fn(async () => account) } } },
            tx: { Balances: { transfer_keep_alive: transfer } },
        },
    };
    return { module: new BalancesModule(substrate as never), transfer };
}

describe('BalancesModule', () => {
    it('reads an account’s balance and nonce', async () => {
        const { module } = client({ nonce: 4, data: { free: '10', reserved: 2n, frozen: 1 } });
        expect(await module.account(ALICE)).toEqual({
            free: 10n,
            reserved: 2n,
            frozen: 1n,
            nonce: 4,
        });
    });

    it('transfers keep-alive to the account as SS58', async () => {
        const { module, transfer } = client(null);
        const evm = '0x' + 'ab'.repeat(20);
        await module.transferKeepAlive(evm, 5n, {} as never);
        const args = transfer.mock.calls[0]![0] as { dest: string; value: bigint };
        expect(args.value).toBe(5n);
        expect(args.dest).toMatch(/^5/);
        expect(() => module.transferKeepAlive(ALICE, 0n, {} as never)).toThrow(/positive/);
    });
});
