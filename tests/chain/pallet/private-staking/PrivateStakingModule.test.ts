import { describe, it, expect, vi } from 'vitest';
import { PrivateStakingModule } from '../../../../src/chain/pallet/private-staking/PrivateStakingModule';
import type { SubstrateClient } from '../../../../src/chain/substrate/SubstrateClient';
import { readEntryQueueFull } from '../../../../src/chain/pallet/private-staking/storage/reads';

/**
 * A client whose staking reads answer `slashable`, in era 5, with bonding 28 and the
 * runtime's worked-out unbonding `fast` (`EraPruning.FastUnbond`).
 */
const client = (slashable: boolean, fast: [number, number, number] | null = [5, 28, 2]) =>
    ({
        unsafe: {
            query: {
                Staking: {
                    AreNominatorsSlashable: { getValue: vi.fn(async () => slashable) },
                    ActiveEra: { getValue: vi.fn(async () => ({ index: 5 })) },
                },
                EraPruning: { FastUnbond: { getValue: vi.fn(async () => fast ?? undefined) } },
            },
            constants: { Staking: { BondingDuration: async () => 28 } },
        },
    }) as unknown as SubstrateClient;

describe('PrivateStakingModule.exitUnbondingEras', () => {
    it('is the fast unbond once no slashable era is in reach', async () => {
        expect(await new PrivateStakingModule(client(false)).exitUnbondingEras()).toBe(2);
    });

    it('is the full bonding duration while one is', async () => {
        expect(await new PrivateStakingModule(client(false, [5, 28, 28])).exitUnbondingEras()).toBe(
            28
        );
    });

    it('is the full bonding duration while nominators are slashable', async () => {
        expect(await new PrivateStakingModule(client(true)).exitUnbondingEras()).toBe(28);
    });

    it('is the full bonding duration when the working is stale', async () => {
        expect(await new PrivateStakingModule(client(false, [4, 28, 2])).exitUnbondingEras()).toBe(
            28
        );
        expect(await new PrivateStakingModule(client(false, null)).exitUnbondingEras()).toBe(28);
    });
});

describe('readEntryQueueFull', () => {
    const page = (era: number, n: number, len: number) => ({
        keyArgs: [1, [era, n]],
        value: new Array(len),
    });
    const queue = (pages: ReturnType<typeof page>[]) =>
        ({
            unsafe: {
                query: { PrivateStaking: { Entries: { getEntries: async () => pages } } },
                constants: { PrivateStaking: { MaxQueue: async () => 2, MaxPages: async () => 2 } },
            },
        }) as unknown as SubstrateClient;

    it('is full only when every page of the era is', async () => {
        expect(await readEntryQueueFull(queue([page(5, 0, 2), page(5, 1, 2)]), 1, 5)).toBe(true);
        expect(await readEntryQueueFull(queue([page(5, 0, 2), page(5, 1, 1)]), 1, 5)).toBe(false);
        // Pages of another era do not count.
        expect(await readEntryQueueFull(queue([page(4, 0, 2), page(4, 1, 2)]), 1, 5)).toBe(false);
    });
});
