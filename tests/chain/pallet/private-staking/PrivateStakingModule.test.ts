import { describe, it, expect, vi } from 'vitest';
import { PrivateStakingModule } from '../../../../src/chain/pallet/private-staking/PrivateStakingModule';
import type { SubstrateClient } from '../../../../src/chain/substrate/SubstrateClient';
import { readEntryQueueFull } from '../../../../src/chain/pallet/private-staking/storage/reads';

/** A client whose staking reads answer `slashable`, with bonding 28 and fast unbond 2. */
const client = (slashable: boolean) =>
    ({
        unsafe: {
            query: {
                Staking: { AreNominatorsSlashable: { getValue: vi.fn(async () => slashable) } },
            },
            constants: {
                Staking: {
                    BondingDuration: async () => 28,
                    NominatorFastUnbondDuration: async () => 2,
                },
            },
        },
    }) as unknown as SubstrateClient;

describe('PrivateStakingModule.exitUnbondingEras', () => {
    it('is the fast unbond while nominators are not slashable', async () => {
        expect(await new PrivateStakingModule(client(false)).exitUnbondingEras()).toBe(2);
    });

    it('is the full bonding duration once they are', async () => {
        expect(await new PrivateStakingModule(client(true)).exitUnbondingEras()).toBe(28);
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
