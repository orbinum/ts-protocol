import { describe, it, expect, vi } from 'vitest';
import { NominationPoolsModule } from '../../../../src/chain/pallet/nomination-pools/NominationPoolsModule';
import type { SubstrateClient } from '../../../../src/chain/substrate/SubstrateClient';

const ALICE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const BOB = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const CHARLIE = '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y';
const ORB = 10n ** 18n;
const signer = {} as never;
const FINALIZED_OK: unknown = { txHash: '0xabc', ok: true, block: { hash: '0xb', number: 1 } };

/**
 * A client whose `unsafe.tx.NominationPools.<call>` records its arguments; `candidates`
 * validate; `reads` adds the UnsafeApi's `query` and `apis`.
 */
const POOL_BONDED = '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy';
const POOL_REWARD = '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw';

function txClient(candidates: string[] = [ALICE, BOB], reads: Record<string, unknown> = {}) {
    const entries: Record<string, ReturnType<typeof vi.fn>> = {};
    // `join` reads the join minimum and whether the signer stakes directly.
    const query = (reads['query'] ?? {}) as Record<string, Record<string, unknown>>;
    const client = {
        // `Staking.Validators` presence, keyed by the stash itself in this fake.
        getDynamicBuilder: async () => ({
            buildStorage: () => ({ keys: { enc: (stash: string) => stash } }),
        }),
        request: vi.fn(async (_method: string, [key]: [string]) =>
            candidates.includes(key) ? '0x00' : null
        ),
        unsafe: {
            ...reads,
            query: {
                ...query,
                NominationPools: {
                    MinJoinBond: { getValue: async () => ORB },
                    ...query['NominationPools'],
                },
                Staking: {
                    Ledger: { getValue: async () => undefined },
                    Nominators: { getValue: async () => undefined },
                    Validators: { getValue: async () => ({ commission: 0, blocked: false }) },
                    ...query['Staking'],
                },
            },
            apis: {
                NominationPoolsApi: { pool_accounts: async () => [POOL_BONDED, POOL_REWARD] },
                ...(reads['apis'] as Record<string, unknown>),
            },
            tx: {
                NominationPools: new Proxy(
                    {},
                    {
                        get: (_, call: string) =>
                            (entries[call] ??= vi.fn().mockReturnValue({
                                createAndSubmit: vi.fn().mockResolvedValue(FINALIZED_OK),
                            })),
                    }
                ),
            },
        },
    } as unknown as SubstrateClient;
    return {
        module: new NominationPoolsModule(client),
        args: (call: string) => entries[call]?.mock.calls[0]?.[0],
        called: (call: string) => entries[call] !== undefined,
    };
}

describe('NominationPoolsModule calls', () => {
    it('encode each call by the runtime’s argument names', async () => {
        const { module, args } = txClient();
        await module.join(5n * ORB, 3, signer);
        expect(args('join')).toEqual({ amount: 5n * ORB, pool_id: 3 });
        await module.bondExtra({ type: 'FreeBalance', amount: ORB }, signer);
        expect(args('bond_extra')).toEqual({ extra: { type: 'FreeBalance', value: ORB } });
        await module.bondExtraOther(BOB, signer);
        expect(args('bond_extra_other')).toEqual({
            member: BOB,
            extra: { type: 'Rewards', value: undefined },
        });
        await module.claimPayout(signer);
        expect(args('claim_payout')).toEqual({});
        await module.claimPayoutOther(BOB, signer);
        expect(args('claim_payout_other')).toEqual({ other: BOB });
        await module.unbond(BOB, 2n * ORB, signer);
        expect(args('unbond')).toEqual({ member_account: BOB, unbonding_points: 2n * ORB });
        await module.withdrawUnbonded(BOB, signer);
        expect(args('withdraw_unbonded')).toEqual({ member_account: BOB, num_slashing_spans: 0 });
        await module.poolWithdrawUnbonded(3, signer);
        expect(args('pool_withdraw_unbonded')).toEqual({ pool_id: 3, num_slashing_spans: 0 });
        await module.create(
            { amount: 100n * ORB, root: ALICE, nominator: BOB, bouncer: CHARLIE },
            signer
        );
        expect(args('create')).toEqual({
            amount: 100n * ORB,
            root: ALICE,
            nominator: BOB,
            bouncer: CHARLIE,
        });
        await module.nominate(3, [ALICE, BOB], signer);
        expect(args('nominate')).toEqual({ pool_id: 3, validators: [ALICE, BOB] });
        await module.setState(3, 'Blocked', signer);
        expect(args('set_state')).toEqual({
            pool_id: 3,
            state: { type: 'Blocked', value: undefined },
        });
        await module.chill(3, signer);
        expect(args('chill')).toEqual({ pool_id: 3 });
        await module.setClaimPermission('PermissionlessAll', signer);
        expect(args('set_claim_permission')).toEqual({
            permission: { type: 'PermissionlessAll', value: undefined },
        });
    });

    it('bond rewards with no amount', async () => {
        const { module, args } = txClient();
        await module.bondExtra({ type: 'Rewards' }, signer);
        expect(args('bond_extra')).toEqual({ extra: { type: 'Rewards', value: undefined } });
    });

    it('accept a hex account id and pass it as SS58', async () => {
        const { module, args } = txClient();
        const hex = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';
        await module.claimPayoutOther(hex, signer);
        expect(args('claim_payout_other')).toEqual({ other: ALICE });
    });

    it('refuses to nominate a validator blocking new nominations, unless the pool already does', async () => {
        const blocking = {
            query: {
                Staking: {
                    Validators: {
                        getValue: async (v: string) => ({ commission: 0, blocked: v === BOB }),
                    },
                },
            },
        };
        const { module, called } = txClient([ALICE, BOB], blocking);
        await expect(module.nominate(1, [ALICE, BOB], signer)).rejects.toThrow(
            `blocks new nominations: ${BOB}`
        );
        expect(called('nominate')).toBe(false);

        const keeps = txClient([ALICE], {
            query: {
                Staking: {
                    ...blocking.query.Staking,
                    // Already a target: kept even though BOB blocks and chilled since.
                    Nominators: {
                        getValue: async (who: string) =>
                            who === POOL_BONDED ? { targets: [BOB] } : undefined,
                    },
                },
            },
        });
        await keeps.module.nominate(1, [ALICE, BOB], signer);
        expect(keeps.called('nominate')).toBe(true);
    });

    it('refuse to nominate an account that does not validate: the chain would refuse it after the fee', async () => {
        const { module, called } = txClient([ALICE]);
        await expect(module.nominate(1, [ALICE, BOB], signer)).rejects.toThrow(
            `not a validator: ${BOB}`
        );
        expect(called('nominate')).toBe(false);
    });

    it('refuse what the runtime would refuse, before signing', async () => {
        const { module, called } = txClient();
        expect(() => module.join(0n, 1, signer)).toThrow(/positive/);
        expect(() => module.join(ORB, -1, signer)).toThrow(/u32/);
        expect(() => module.join(ORB, 2 ** 32, signer)).toThrow(/u32/);
        expect(() => module.bondExtra({ type: 'FreeBalance', amount: 0n }, signer)).toThrow(
            /positive/
        );
        expect(() =>
            module.bondExtra({ type: 'All' } as unknown as { type: 'Rewards' }, signer)
        ).toThrow(/FreeBalance or Rewards/);
        expect(() => module.bondExtraOther('0xnot', signer)).toThrow(/not an account/);
        expect(() => module.unbond(BOB, 0n, signer)).toThrow(/positive/);
        expect(() => module.unbond('bob', ORB, signer)).toThrow(/not an account/);
        expect(() => module.withdrawUnbonded('', signer)).toThrow(/not an account/);
        expect(() => module.poolWithdrawUnbonded(1.5, signer)).toThrow(/u32/);
        expect(() =>
            module.create({ amount: ORB, root: ALICE, nominator: 'x', bouncer: ALICE }, signer)
        ).toThrow(/create.nominator/);
        expect(() =>
            module.create(
                { amount: 2n ** 128n, root: ALICE, nominator: ALICE, bouncer: ALICE },
                signer
            )
        ).toThrow(/u128/);
        await expect(module.nominate(1, [], signer)).rejects.toThrow(/empty/);
        await expect(module.nominate(1, Array(17).fill(ALICE), signer)).rejects.toThrow(
            /at most 16/
        );
        await expect(module.nominate(1, [ALICE, ALICE], signer)).rejects.toThrow(/duplicates/);
        expect(() => module.setState(1, 'Closed' as never, signer)).toThrow(/not one of/);
        expect(() => module.chill(-1, signer)).toThrow(/u32/);
        expect(() => module.setClaimPermission('Anyone' as never, signer)).toThrow(/not one of/);
        expect(called('join') || called('nominate') || called('create')).toBe(false);
    });
});

const value = <T>(v: T) => ({ getValue: vi.fn().mockResolvedValue(v) });

const RAW_POOL = {
    commission: {
        current: [50_000_000, CHARLIE],
        max: 100_000_000,
        change_rate: { max_increase: 10_000_000, min_delay: 600 },
        throttle_from: 27,
        claim_permission: { type: 'Account', value: BOB },
    },
    member_counter: 2,
    points: 150n * ORB,
    roles: { depositor: CHARLIE, root: CHARLIE, nominator: BOB, bouncer: undefined },
    state: { type: 'Open' },
};

const POOL_SUMMARY = {
    id: 1,
    state: 'Open',
    points: 150n * ORB,
    memberCount: 2,
    roles: { depositor: CHARLIE, root: CHARLIE, nominator: BOB, bouncer: null },
    commission: {
        current: { rate: 50_000_000, payee: CHARLIE },
        max: 100_000_000,
        changeRate: { maxIncrease: 10_000_000, minDelay: 600 },
        throttleFrom: 27,
        claimPermission: { type: 'Account', account: BOB },
    },
    metadata: 'Orbinum pool',
};

describe('NominationPoolsModule reads', () => {
    it('reads the config, with unset limits as null', async () => {
        const client = {
            unsafe: {
                query: {
                    NominationPools: {
                        MinJoinBond: value(ORB),
                        MinCreateBond: value(100n * ORB),
                        MaxPools: value(undefined),
                        MaxPoolMembers: value(1000),
                        MaxPoolMembersPerPool: value(undefined),
                        GlobalMaxCommission: value(200_000_000),
                        CounterForBondedPools: value(2),
                        CounterForPoolMembers: value(5),
                        LastPoolId: value(3),
                        TotalValueLocked: value(500n * ORB),
                    },
                },
            },
        } as unknown as SubstrateClient;
        expect(await new NominationPoolsModule(client).config()).toEqual({
            minJoinBond: ORB,
            minCreateBond: 100n * ORB,
            maxPools: null,
            maxPoolMembers: 1000,
            maxPoolMembersPerPool: null,
            globalMaxCommission: 200_000_000,
            poolCount: 2,
            memberCount: 5,
            lastPoolId: 3,
            totalValueLocked: 500n * ORB,
        });
    });

    function poolClient(bonded: unknown, nominations: unknown) {
        const apis = {
            pool_accounts: vi.fn().mockResolvedValue([ALICE, BOB]),
            pool_balance: vi.fn().mockResolvedValue(149n * ORB),
        };
        const client = {
            unsafe: {
                query: {
                    NominationPools: {
                        BondedPools: value(bonded),
                        RewardPools: value({
                            last_recorded_total_payouts: 8n,
                            total_rewards_claimed: 7n,
                            total_commission_pending: 2n,
                            total_commission_claimed: 1n,
                        }),
                        Metadata: value(new TextEncoder().encode('Orbinum pool')),
                        GlobalMaxCommission: value(undefined),
                    },
                    Staking: { Nominators: value(nominations) },
                    System: { Account: value({ data: { free: 1_000n, frozen: 0n } }) },
                },
                apis: { NominationPoolsApi: apis },
            },
        } as unknown as SubstrateClient;
        return { module: new NominationPoolsModule(client), apis };
    }

    it('reads a pool with its accounts, balance, nominations and reward totals', async () => {
        const { module, apis } = poolClient(RAW_POOL, { targets: [ALICE], submitted_in: 4 });
        expect(await module.pool(1)).toEqual({
            ...POOL_SUMMARY,
            bondedAccount: ALICE,
            rewardAccount: BOB,
            balance: 149n * ORB,
            nominations: [ALICE],
            // 5% of the 1 000 planck paid since the last record (1 000 + 7 + 1 - 8), plus 2 pending.
            rewards: {
                totalClaimed: 7n,
                commissionPending: 2n,
                commissionClaimable: 52n,
                commissionClaimed: 1n,
            },
        });
        expect(apis.pool_accounts).toHaveBeenCalledWith(1, { at: 'best' });
    });

    it('reads a pool that takes no commission and does not nominate', async () => {
        const { module } = poolClient(
            { ...RAW_POOL, commission: {}, state: { type: 'Destroying' } },
            undefined
        );
        expect(await module.pool(1)).toMatchObject({
            state: 'Destroying',
            nominations: null,
            commission: { current: null, max: null, changeRate: null, claimPermission: null },
        });
    });

    it('reads no pool for an unknown id, and refuses one that is not a u32', async () => {
        const { module } = poolClient(undefined, undefined);
        expect(await module.pool(9)).toBeNull();
        await expect(module.pool(-1)).rejects.toThrow(/u32/);
    });

    it('lists pools by id, each with its name', async () => {
        const client = {
            unsafe: {
                query: {
                    NominationPools: {
                        BondedPools: {
                            getEntries: vi.fn().mockResolvedValue([
                                { keyArgs: [2], value: { ...RAW_POOL, member_counter: 1 } },
                                { keyArgs: [1], value: RAW_POOL },
                            ]),
                        },
                        Metadata: {
                            getEntries: vi.fn().mockResolvedValue([
                                {
                                    keyArgs: [1],
                                    value: new TextEncoder().encode('Orbinum pool'),
                                },
                            ]),
                        },
                    },
                },
            },
        } as unknown as SubstrateClient;
        const pools = await new NominationPoolsModule(client).pools();
        expect(pools).toEqual([
            POOL_SUMMARY,
            { ...POOL_SUMMARY, id: 2, memberCount: 1, metadata: '' },
        ]);
    });

    function memberClient(member: unknown) {
        const apis = {
            member_total_balance: vi.fn().mockResolvedValue(12n * ORB),
            pending_rewards: vi.fn().mockResolvedValue(3n),
            points_to_balance: vi.fn().mockResolvedValue(9n * ORB),
        };
        const client = {
            unsafe: {
                query: {
                    NominationPools: {
                        PoolMembers: value(member),
                        ClaimPermissions: value({ type: 'PermissionlessWithdraw' }),
                    },
                },
                apis: { NominationPoolsApi: apis },
            },
        } as unknown as SubstrateClient;
        return { module: new NominationPoolsModule(client), apis };
    }

    it('reads a member: points, balances, unbonding chunks, rewards and permission', async () => {
        const { module, apis } = memberClient({
            pool_id: 1,
            points: 10n * ORB,
            last_recorded_reward_counter: 0n,
            unbonding_eras: [[9, 3n * ORB]],
        });
        expect(await module.member(BOB)).toEqual({
            account: BOB,
            poolId: 1,
            points: 10n * ORB,
            active: 9n * ORB,
            total: 12n * ORB,
            unbonding: [{ era: 9, points: 3n * ORB }],
            pendingRewards: 3n,
            claimPermission: 'PermissionlessWithdraw',
        });
        expect(apis.points_to_balance).toHaveBeenCalledWith(1, 10n * ORB, { at: 'best' });
    });

    it('reads no active balance for a member that unbonded everything', async () => {
        const { module, apis } = memberClient({
            pool_id: 1,
            points: 0n,
            last_recorded_reward_counter: 0n,
            unbonding_eras: [[9, 10n * ORB]],
        });
        expect(await module.member(BOB)).toMatchObject({ points: 0n, active: 0n });
        expect(apis.points_to_balance).not.toHaveBeenCalled();
    });

    it('reads no member outside a pool', async () => {
        const { module } = memberClient(undefined);
        expect(await module.member(BOB)).toBeNull();
        await expect(module.member('nobody')).rejects.toThrow(/not an account/);
    });

    it('reads pending rewards and the value of points', async () => {
        const { module, apis } = memberClient(undefined);
        expect(await module.pendingRewards(BOB)).toBe(3n);
        expect(apis.pending_rewards).toHaveBeenCalledWith(BOB, { at: 'best' });
        expect(await module.pointsToBalance(1, 10n * ORB)).toBe(9n * ORB);
    });

    it('reads the deferred slashes that reach a pool: those naming its bonded account', async () => {
        const POOL_STASH = ALICE;
        const slash = (validator: string, others: [string, bigint][]) => ({
            validator,
            own: 0n,
            others,
            reporter: undefined,
            payout: 0n,
        });
        const client = {
            unsafe: {
                query: {
                    Staking: {
                        UnappliedSlashes: {
                            getEntries: vi.fn().mockResolvedValue([
                                {
                                    keyArgs: [30, [BOB, 100_000_000, 0]],
                                    value: slash(BOB, [
                                        [BOB, 1n],
                                        [POOL_STASH, 5n * ORB],
                                    ]),
                                },
                                {
                                    keyArgs: [31, [BOB, 100_000_000, 1]],
                                    value: slash(BOB, [[BOB, 2n]]),
                                },
                                {
                                    // Cancelled by governance: staking skips it.
                                    keyArgs: [32, [BOB, 100_000_000, 0]],
                                    value: slash(BOB, [[POOL_STASH, 9n]]),
                                },
                                {
                                    // Only partly cancelled: still applies.
                                    keyArgs: [33, [BOB, 100_000_000, 0]],
                                    value: slash(BOB, [[POOL_STASH, 3n]]),
                                },
                            ]),
                        },
                        CancelledSlashes: {
                            getValue: vi.fn(async (era: number) =>
                                era === 32
                                    ? [[BOB, 100_000_000]]
                                    : era === 33
                                      ? [[BOB, 50_000_000]]
                                      : []
                            ),
                        },
                    },
                },
                apis: {
                    NominationPoolsApi: {
                        pool_accounts: vi.fn().mockResolvedValue([POOL_STASH, BOB]),
                    },
                },
            },
        } as unknown as SubstrateClient;
        expect(await new NominationPoolsModule(client).pendingSlashes(1)).toEqual([
            { era: 30, validator: BOB, amount: 5n * ORB },
            { era: 33, validator: BOB, amount: 3n },
        ]);
    });
});

const ALICE_KEY = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';
const BOB_KEY = '0x8eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a48';
const keyBytes = (hex: string) => Uint8Array.from(Buffer.from(hex.slice(2), 'hex'));
/** A signer for `key`'s account: only its public key is read before signing. */
const signerOf = (hex: string) => ({ publicKey: keyBytes(hex) }) as never;
const PCT = 10_000_000;

/**
 * A pool 1 whose root is Alice with `commission`, at best block `best`, whose calls
 * record their arguments.
 */
function commissionClient(
    commission: Record<string, unknown> = {},
    { globalMax, best = 100, pending = 0n } = {} as {
        globalMax?: number;
        best?: number;
        pending?: bigint;
    }
) {
    const raw = {
        ...RAW_POOL,
        commission,
        roles: { depositor: ALICE, root: ALICE, nominator: ALICE, bouncer: ALICE },
    };
    return txClient([ALICE, BOB], {
        query: {
            NominationPools: {
                BondedPools: {
                    getValue: vi.fn(async (id: number) => (id === 1 ? raw : undefined)),
                },
                GlobalMaxCommission: value(globalMax),
                RewardPools: value({
                    last_recorded_total_payouts: 0n,
                    total_rewards_claimed: 0n,
                    total_commission_pending: pending,
                    total_commission_claimed: 0n,
                }),
                Metadata: value(new Uint8Array()),
            },
            Staking: { Nominators: value(undefined) },
            System: {
                Number: value(best),
                Account: value({ data: { free: 0n, frozen: 0n } }),
            },
        },
        apis: {
            NominationPoolsApi: {
                pool_accounts: vi.fn().mockResolvedValue([BOB, CHARLIE]),
                pool_balance: vi.fn().mockResolvedValue(0n),
            },
        },
    });
}

describe('NominationPoolsModule commission calls', () => {
    const alice = signerOf(ALICE_KEY);
    const bob = signerOf(BOB_KEY);

    it('encode each call by the runtime’s argument names', async () => {
        const { module, args } = commissionClient({}, { pending: 5n });
        await module.setCommission(1, { commission: 5 * PCT, payee: CHARLIE }, alice);
        expect(args('set_commission')).toEqual({
            pool_id: 1,
            new_commission: [5 * PCT, CHARLIE],
        });
        await module.setCommissionMax(1, 20 * PCT, alice);
        expect(args('set_commission_max')).toEqual({ pool_id: 1, max_commission: 20 * PCT });
        await module.setCommissionChangeRate(1, { maxIncrease: PCT, minDelay: 600 }, alice);
        expect(args('set_commission_change_rate')).toEqual({
            pool_id: 1,
            change_rate: { max_increase: PCT, min_delay: 600 },
        });
        await module.setCommissionClaimPermission(1, { type: 'Account', account: BOB }, alice);
        expect(args('set_commission_claim_permission')).toEqual({
            pool_id: 1,
            permission: { type: 'Account', value: BOB },
        });
    });

    it('encode removal and the root-only permission as none', async () => {
        const { module, args } = commissionClient();
        await module.setCommission(1, null, alice);
        expect(args('set_commission')).toEqual({ pool_id: 1, new_commission: undefined });
        await module.setCommissionClaimPermission(1, null, alice);
        expect(args('set_commission_claim_permission')).toEqual({
            pool_id: 1,
            permission: undefined,
        });
    });

    it('claim when something is pending and a payee is set', async () => {
        const { module, args } = commissionClient({ current: [5 * PCT, CHARLIE] }, { pending: 5n });
        await module.claimCommission(1, alice);
        expect(args('claim_commission')).toEqual({ pool_id: 1 });
    });

    it('accept an EVM payee as its mapped account', async () => {
        const { module, args } = commissionClient();
        await module.setCommission(
            1,
            { commission: PCT, payee: '0xf24FF3a9CF04c71Dbc94D0b566f7A27B94566cac' },
            alice
        );
        const [, payee] = args('set_commission').new_commission;
        expect(payee).toMatch(/^5/);
        expect(payee).not.toBe(ALICE);
    });

    it('refuse what the chain would refuse, before signing', async () => {
        const rated = {
            current: [5 * PCT, CHARLIE],
            max: 20 * PCT,
            change_rate: { max_increase: 2 * PCT, min_delay: 10 },
            throttle_from: 95,
        };
        const { module, called } = commissionClient(rated, { globalMax: 15 * PCT, best: 100 });
        const set = (percent: number, signer = alice) =>
            module.setCommission(1, { commission: percent * PCT, payee: CHARLIE }, signer);
        await expect(set(6, bob)).rejects.toThrow('setCommission: DoesNotHavePermission');
        // Too soon: 100 + 1 - 95 < 10.
        await expect(set(6)).rejects.toThrow('CommissionChangeThrottled');
        // Too large.
        await expect(set(8)).rejects.toThrow('CommissionChangeThrottled');
        await expect(module.setCommissionMax(1, 21 * PCT, alice)).rejects.toThrow(
            'CommissionExceedsGlobalMaximum'
        );
        await expect(module.setCommissionMax(1, 15 * PCT, bob)).rejects.toThrow(
            'DoesNotHavePermission'
        );
        await expect(
            module.setCommissionChangeRate(1, { maxIncrease: 3 * PCT, minDelay: 10 }, alice)
        ).rejects.toThrow('CommissionChangeRateNotAllowed');
        await expect(
            module.setCommissionChangeRate(1, { maxIncrease: 2 * PCT, minDelay: 9 }, alice)
        ).rejects.toThrow('CommissionChangeRateNotAllowed');
        await expect(
            module.setCommissionClaimPermission(1, { type: 'Permissionless' }, bob)
        ).rejects.toThrow('DoesNotHavePermission');
        await expect(module.claimCommission(1, bob)).rejects.toThrow('DoesNotHavePermission');
        await expect(module.claimCommission(1, alice)).rejects.toThrow('NoPendingCommission');
        await expect(module.setCommission(2, null, alice)).rejects.toThrow('no pool 2');
        expect(
            [
                'set_commission',
                'set_commission_max',
                'set_commission_change_rate',
                'set_commission_claim_permission',
                'claim_commission',
            ].some(called)
        ).toBe(false);
    });

    it('refuse a commission above the pool’s max, and a max above the current one', async () => {
        const { module } = commissionClient({ max: 20 * PCT });
        await expect(
            module.setCommission(1, { commission: 21 * PCT, payee: CHARLIE }, alice)
        ).rejects.toThrow('CommissionExceedsMaximum');
        await expect(module.setCommissionMax(1, 21 * PCT, alice)).rejects.toThrow(
            'MaxCommissionRestricted'
        );
    });

    it('refuse malformed arguments', () => {
        const { module } = commissionClient();
        const throws = (run: () => unknown, pattern: RegExp) =>
            expect(run).rejects.toThrow(pattern);
        return Promise.all([
            throws(
                () => module.setCommission(1, { commission: 1.5, payee: BOB }, alice),
                /Perbill/
            ),
            throws(
                () => module.setCommission(1, { commission: 1e9 + 1, payee: BOB }, alice),
                /Perbill/
            ),
            throws(() => module.setCommission(1, { commission: 1, payee: 'x' }, alice), /payee/),
            throws(() => module.setCommission(-1, null, alice), /u32/),
            throws(() => module.setCommissionMax(1, -1, alice), /Perbill/),
            throws(
                () => module.setCommissionChangeRate(1, { maxIncrease: 1, minDelay: -1 }, alice),
                /minDelay/
            ),
            throws(
                () =>
                    module.setCommissionClaimPermission(
                        1,
                        { type: 'Anyone' } as unknown as { type: 'Permissionless' },
                        alice
                    ),
                /not Permissionless, Account or null/
            ),
            throws(
                () =>
                    module.setCommissionClaimPermission(1, { type: 'Account', account: '' }, alice),
                /not an account/
            ),
        ]);
    });
});

describe('NominationPoolsModule.join, before signing', () => {
    it('refuses less than the join minimum', async () => {
        const { module, called } = txClient();
        await expect(module.join(ORB - 1n, 3, signer)).rejects.toThrow('below the');
        expect(called('join')).toBe(false);
    });

    it('refuses a signer that stakes directly: the chain keeps the two apart', async () => {
        const { module, called } = txClient([ALICE, BOB], {
            query: { Staking: { Ledger: value({ total: ORB, active: ORB, unlocking: [] }) } },
        });
        await expect(module.join(5n * ORB, 3, signerOf(ALICE_KEY))).rejects.toThrow(
            'stakes directly'
        );
        expect(called('join')).toBe(false);
    });
});
