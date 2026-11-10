import { describe, it, expect, vi } from 'vitest';
import { StakingModule } from '../../../../src/chain/pallet/staking/StakingModule';
import { paidAutomatically } from '../../../../src/chain/pallet/staking/autoPayout';
import type { SubstrateClient } from '../../../../src/chain/substrate/SubstrateClient';
import type { AutoPayoutStatus } from '../../../../src/chain/pallet/staking/types/index';

const ALICE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const BOB = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const CHARLIE = '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y';
const DAVE = '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy';

function client(s: { paused?: boolean; queue?: number[]; current?: unknown; planned?: number }) {
    const value = (v: unknown) => ({ getValue: vi.fn().mockResolvedValue(v) });
    return new StakingModule({
        unsafe: {
            query: {
                AutoPayout: {
                    Paused: value(s.paused ?? false),
                    Queue: value(s.queue ?? []),
                    Current: value(s.current),
                },
                Staking: { CurrentEra: value(s.planned) },
            },
            constants: {
                AutoPayout: { ExpiryMargin: async () => 2 },
                Staking: { HistoryDepth: async () => 84 },
            },
        },
    } as unknown as SubstrateClient);
}

describe('StakingModule.autoPayout', () => {
    it('reads the era being paid and its progress in pages', async () => {
        const status = await client({
            planned: 90,
            queue: [8],
            current: {
                era: 7,
                validators: [
                    { stash: ALICE, pages: 2 },
                    { stash: BOB, pages: 3 },
                    { stash: CHARLIE, pages: 1 },
                ],
                validator: 1,
                page: 2,
            },
        }).autoPayout();
        expect(status).toEqual({
            paused: false,
            queued: [8],
            safeFrom: 8,
            paying: {
                era: 7,
                pages: 6,
                pagesDone: 4,
                validators: [ALICE, BOB, CHARLIE],
                next: { validator: 1, page: 2 },
            },
        });
    });

    it('is idle between eras', async () => {
        expect(await client({}).autoPayout()).toEqual({
            paused: false,
            queued: [],
            safeFrom: 0,
            paying: null,
        });
    });
});

describe('paidAutomatically', () => {
    const status: AutoPayoutStatus = {
        paused: false,
        queued: [9],
        safeFrom: 0,
        paying: {
            era: 8,
            pages: 10,
            pagesDone: 3,
            validators: [ALICE, BOB, CHARLIE],
            next: { validator: 1, page: 1 },
        },
    };

    it('covers the era being paid and the queued ones', () => {
        expect(paidAutomatically(8, status)).toBe(true);
        expect(paidAutomatically(9, status)).toBe(true);
    });

    it('leaves other pending eras to manual claims', () => {
        // Skipped by the chain, or older than automatic payment.
        expect(paidAutomatically(5, status)).toBe(false);
    });

    it('leaves a validator the cursor passed to a manual claim', () => {
        // Alice's pages were paid or skipped; still pending means skipped.
        expect(paidAutomatically(8, status, ALICE)).toBe(false);
        expect(paidAutomatically(8, status, BOB)).toBe(true);
        expect(paidAutomatically(8, status, CHARLIE)).toBe(true);
        // Not among the era's validators: the chain will not pay it.
        expect(paidAutomatically(8, status, DAVE)).toBe(false);
        expect(paidAutomatically(9, status, ALICE)).toBe(true);
    });

    it('leaves an era close to leaving the history to a manual claim', () => {
        // Queued, but the chain may drop it before reaching it.
        expect(paidAutomatically(9, { ...status, safeFrom: 10 })).toBe(false);
        expect(paidAutomatically(9, { ...status, safeFrom: 9 })).toBe(true);
    });

    it('leaves everything to manual claims while paused', () => {
        expect(paidAutomatically(8, { ...status, paused: true })).toBe(false);
    });
});
