import { describe, it, expect, vi } from 'vitest';
import { StakingModule } from '../../../../src/chain/pallet/staking/StakingModule';
import { OPEN_MODE_MIN_SELF_BOND } from '../../../../src/chain/pallet/staking/constants';
import type { SubstrateClient } from '../../../../src/chain/substrate/SubstrateClient';

const ALICE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const BOB = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const ORB = 10n ** 18n;
const signer = {} as never;
const FINALIZED_OK: unknown = { txHash: '0xabc', ok: true, block: { hash: '0xb', number: 1 } };

/**
 * A client whose `unsafe.tx.<pallet>.<call>` records its arguments; `candidates` validate,
 * and `maxCommission` is the on-chain ceiling (none by default).
 */
function txClient(
    candidates: string[] = [ALICE, BOB],
    maxCommission = 1_000_000_000,
    chain: {
        minCommission?: number;
        blocked?: string[];
        nominations?: Record<string, string[]>;
        poolMembers?: string[];
        /** Active bond by stash. */
        bonded?: Record<string, bigint>;
        minNominatorBond?: bigint;
        minValidatorBond?: bigint;
        /** Free balance by account; plenty by default. */
        free?: Record<string, bigint>;
        fee?: bigint;
    } = {}
) {
    const entries: Record<string, ReturnType<typeof vi.fn>> = {};
    const pallet = (name: string) =>
        new Proxy(
            {},
            {
                get: (_, call: string) =>
                    (entries[`${name}.${call}`] ??= vi.fn().mockReturnValue({
                        createAndSubmit: vi.fn().mockResolvedValue(FINALIZED_OK),
                        getEstimatedFees: vi.fn().mockResolvedValue(chain.fee ?? 0n),
                    })),
            }
        );
    const client = {
        // `Staking.Validators` presence, keyed by the stash itself in this fake.
        getDynamicBuilder: async () => ({
            buildStorage: () => ({ keys: { enc: (stash: string) => stash } }),
        }),
        request: vi.fn(async (_method: string, [key]: [string]) =>
            candidates.includes(key) ? '0x00' : null
        ),
        unsafe: {
            query: {
                Staking: {
                    MaxCommission: { getValue: vi.fn().mockResolvedValue(maxCommission) },
                    MinCommission: { getValue: async () => chain.minCommission ?? 0 },
                    MinNominatorBond: { getValue: async () => chain.minNominatorBond ?? 0n },
                    MinValidatorBond: { getValue: async () => chain.minValidatorBond ?? 0n },
                    Ledger: {
                        getValue: async (who: string) =>
                            chain.bonded?.[who] !== undefined
                                ? {
                                      total: chain.bonded[who],
                                      active: chain.bonded[who],
                                      unlocking: [],
                                  }
                                : undefined,
                    },
                    Payee: { getValue: async () => undefined },
                    Validators: {
                        getValue: async (v: string) => ({
                            commission: 0,
                            blocked: chain.blocked?.includes(v) ?? false,
                        }),
                    },
                    Nominators: {
                        getValue: async (n: string) =>
                            chain.nominations?.[n]
                                ? { targets: chain.nominations[n], submitted_in: 0 }
                                : undefined,
                    },
                },
                Session: { NextKeys: { getValue: async () => undefined } },
                System: {
                    Account: {
                        getValue: async (who: string) => ({
                            data: { free: chain.free?.[who] ?? 10n ** 30n },
                        }),
                    },
                },
                NominationPools: {
                    PoolMembers: {
                        getValue: async (who: string) =>
                            chain.poolMembers?.includes(who) ? { pool_id: 1 } : undefined,
                    },
                },
            },
            tx: {
                Staking: pallet('Staking'),
                Session: pallet('Session'),
                ValidatorSet: pallet('ValidatorSet'),
            },
        },
    } as unknown as SubstrateClient;
    return {
        module: new StakingModule(client),
        args: (key: string) => entries[key]?.mock.calls[0]?.[0],
        // Submitted, not only built: `bond` builds its tx first to estimate the fee.
        called: (key: string) =>
            entries[key]?.mock.results.some(
                (r) =>
                    (r.value as { createAndSubmit: ReturnType<typeof vi.fn> }).createAndSubmit.mock
                        .calls.length > 0
            ) ?? false,
    };
}

describe('StakingModule calls', () => {
    it('refuse to nominate an account that does not validate: the chain would refuse it after the fee', async () => {
        const { module, called } = txClient([ALICE]);
        await expect(module.nominate([ALICE, BOB], signer)).rejects.toThrow(
            `not a validator: ${BOB}`
        );
        expect(called('Staking.nominate')).toBe(false);
    });

    it('encode each call by the runtime’s argument names', async () => {
        const { module, args } = txClient();
        await module.bond(10n * ORB, { type: 'Account', account: BOB }, signer);
        expect(args('Staking.bond')).toEqual({
            value: 10n * ORB,
            payee: { type: 'Account', value: BOB },
        });
        await module.bondExtra(ORB, signer);
        expect(args('Staking.bond_extra')).toEqual({ max_additional: ORB });
        await module.unbond(ORB, signer);
        expect(args('Staking.unbond')).toEqual({ value: ORB });
        await module.rebond(ORB, signer);
        expect(args('Staking.rebond')).toEqual({ value: ORB });
        await module.withdrawUnbonded(signer);
        expect(args('Staking.withdraw_unbonded')).toEqual({ num_slashing_spans: 0 });
        await module.setPayee({ type: 'Staked' }, signer);
        expect(args('Staking.set_payee')).toEqual({ payee: { type: 'Staked', value: undefined } });
        await module.nominate([ALICE, BOB], signer);
        expect(args('Staking.nominate')).toEqual({ targets: [ALICE, BOB] });
        await module.validate({ commission: 50_000_000, blocked: true }, signer);
        expect(args('Staking.validate')).toEqual({
            prefs: { commission: 50_000_000, blocked: true },
        });
        await module.chill(signer);
        expect(args('Staking.chill')).toEqual({});
        await module.kick([BOB], signer);
        expect(args('Staking.kick')).toEqual({ who: [BOB] });
        await module.payoutStakers(ALICE, 7, signer);
        expect(args('Staking.payout_stakers')).toEqual({ validator_stash: ALICE, era: 7 });
        await module.purgeKeys(signer);
        expect(args('Session.purge_keys')).toEqual({});
        await module.deregisterValidator(signer);
        expect(args('ValidatorSet.deregister_validator')).toEqual({});
    });

    it('split session keys and pass the proof as bytes', async () => {
        const { module, args } = txClient();
        const aura = 'aa'.repeat(32);
        const grandpa = 'bb'.repeat(32);
        const proof = '0x' + '01'.repeat(128);
        await module.setKeys({ keys: `0x${aura}${grandpa}`, proof }, signer);
        expect(args('Session.set_keys')).toEqual({
            keys: { aura: `0x${aura}`, grandpa: `0x${grandpa}` },
            proof: new Uint8Array(128).fill(1),
        });
    });

    it('refuse what the runtime would refuse, before signing', async () => {
        const { module } = txClient();
        expect(() => module.bond(0n, { type: 'Staked' }, signer)).toThrow(/positive/);
        await expect(module.nominate([], signer)).rejects.toThrow(/empty/);
        await expect(module.nominate(Array(17).fill(ALICE), signer)).rejects.toThrow(/at most 16/);
        await expect(module.nominate([ALICE, ALICE], signer)).rejects.toThrow(/duplicates/);
        await expect(module.nominate(['0xnot'], signer)).rejects.toThrow(/not an account/);
        await expect(
            module.validate({ commission: 1_000_000_001, blocked: false }, signer)
        ).rejects.toThrow(/0 to 1e9/);
        expect(() => module.setKeys({ keys: '0x00', proof: '0x01' }, signer)).toThrow(/64 bytes/);
        expect(() => module.setKeys({ keys: `0x${'aa'.repeat(64)}`, proof: '0x' }, signer)).toThrow(
            /proof/
        );
        expect(() => module.payoutStakers(ALICE, -1, signer)).toThrow(/u32/);
        await expect(
            module.validate({ commission: 0, blocked: 'yes' as unknown as boolean }, signer)
        ).rejects.toThrow(/boolean/);
        expect(() => module.kick([BOB, BOB], signer)).toThrow(/duplicates/);
        expect(() => module.kick(Array(17).fill(BOB), signer)).toThrow(/at most 16/);
        expect(() =>
            module.setPayee({ type: 'Controller' } as unknown as { type: 'Staked' }, signer)
        ).toThrow(/reward destination/);
    });
});

describe('StakingModule.validate and the commission ceiling', () => {
    it('takes any commission while the chain sets no ceiling', async () => {
        const { module, args } = txClient();
        await module.validate({ commission: 1_000_000_000, blocked: false }, signer);
        expect(args('Staking.validate')).toEqual({
            prefs: { commission: 1_000_000_000, blocked: false },
        });
    });

    it('refuses a commission above the on-chain ceiling before signing', async () => {
        const { module, called } = txClient([ALICE, BOB], 200_000_000);
        await expect(
            module.validate({ commission: 200_000_001, blocked: false }, signer)
        ).rejects.toThrow('above the 20% maximum');
        expect(called('Staking.validate')).toBe(false);
        await module.validate({ commission: 200_000_000, blocked: false }, signer);
        expect(called('Staking.validate')).toBe(true);
    });
});

describe('StakingModule calls the chain would refuse after the fee', () => {
    // ALICE's account id, as a signer's public key.
    const alice = {
        publicKey: Uint8Array.from(
            Buffer.from('d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d', 'hex')
        ),
    } as never;

    it('refuses to bond a pool member: staking and pools are exclusive', async () => {
        const { module, called } = txClient([ALICE, BOB], 1_000_000_000, { poolMembers: [ALICE] });
        await expect(module.bond(ORB, { type: 'Staked' }, alice)).rejects.toThrow(
            'nomination pool'
        );
        expect(called('Staking.bond')).toBe(false);
    });

    it('refuses a bond below both role minimums', async () => {
        const chain = { minNominatorBond: 10n * ORB, minValidatorBond: 1_000n * ORB };
        const { module, called } = txClient([ALICE, BOB], 1_000_000_000, chain);
        await expect(module.bond(10n * ORB - 1n, { type: 'Staked' }, alice)).rejects.toThrow(
            'minimum bond'
        );
        expect(called('Staking.bond')).toBe(false);
        await module.bond(10n * ORB, { type: 'Staked' }, alice);
        expect(called('Staking.bond')).toBe(true);
    });

    it('refuses a bond the fee would leave below the minimum: the chain locks less', async () => {
        const chain = {
            minNominatorBond: 100n * ORB,
            minValidatorBond: 1_000n * ORB,
            free: { [ALICE]: 100n * ORB },
            fee: ORB / 100n,
        };
        const { module, called } = txClient([ALICE, BOB], 1_000_000_000, chain);
        await expect(module.bond(100n * ORB, { type: 'Staked' }, alice)).rejects.toThrow(
            'after the fee'
        );
        expect(called('Staking.bond')).toBe(false);
    });

    it('refuses a bond_extra or rebond that leaves the bond below the minimum', async () => {
        const chain = {
            minNominatorBond: 10n * ORB,
            minValidatorBond: 100n * ORB,
            bonded: { [ALICE]: 0n },
        };
        const { module, called } = txClient([ALICE, BOB], 1_000_000_000, chain);
        await expect(module.bondExtra(ORB, alice)).rejects.toThrow('minimum bond');
        await expect(module.rebond(ORB, alice)).rejects.toThrow('minimum bond');
        expect(called('Staking.bond_extra')).toBe(false);
        expect(called('Staking.rebond')).toBe(false);
        await module.bondExtra(10n * ORB, alice);
        expect(called('Staking.bond_extra')).toBe(true);
    });

    it('keeps a current target that stopped validating, as the chain does', async () => {
        // BOB chilled; ALICE keeps nominating him and adds a validator.
        const { module, called } = txClient([ALICE], 1_000_000_000, {
            nominations: { [ALICE]: [BOB] },
        });
        await module.nominate([BOB, ALICE], alice);
        expect(called('Staking.nominate')).toBe(true);
    });

    it("refuses an unbond leaving a nominator below its role's minimum", async () => {
        const chain = {
            minNominatorBond: 10n * ORB,
            bonded: { [ALICE]: 15n * ORB },
            nominations: { [ALICE]: [BOB] },
        };
        const { module, called } = txClient([ALICE, BOB], 1_000_000_000, chain);
        await expect(module.unbond(6n * ORB, alice)).rejects.toThrow('nominator minimum');
        expect(called('Staking.unbond')).toBe(false);
        // Down to the minimum, or everything (the chain chills it), goes through.
        await module.unbond(5n * ORB, alice);
        await module.unbond(15n * ORB, alice);
        expect(called('Staking.unbond')).toBe(true);
    });

    it("refuses an unbond leaving a validator below its role's minimum", async () => {
        const chain = { minValidatorBond: 100n * ORB, bonded: { [ALICE]: 150n * ORB } };
        const { module, called } = txClient([ALICE, BOB], 1_000_000_000, chain);
        await expect(module.unbond(51n * ORB, alice)).rejects.toThrow('validator minimum');
        expect(called('Staking.unbond')).toBe(false);
    });

    it('refuses a commission below the on-chain floor', async () => {
        const { module, called } = txClient([ALICE, BOB], 1_000_000_000, {
            minCommission: 10_000_000,
        });
        await expect(
            module.validate({ commission: 9_999_999, blocked: false }, signer)
        ).rejects.toThrow('below the 1% minimum');
        expect(called('Staking.validate')).toBe(false);
    });

    it('refuses a new target that blocks nominations, but keeps one already nominated', async () => {
        const blocked = txClient([ALICE, BOB], 1_000_000_000, { blocked: [BOB] });
        await expect(blocked.module.nominate([ALICE, BOB], alice)).rejects.toThrow(
            `blocks new nominations: ${BOB}`
        );
        expect(blocked.called('Staking.nominate')).toBe(false);

        const kept = txClient([ALICE, BOB], 1_000_000_000, {
            blocked: [BOB],
            nominations: { [ALICE]: [BOB] },
        });
        await kept.module.nominate([ALICE, BOB], alice);
        expect(kept.called('Staking.nominate')).toBe(true);
    });

    it('refuses to kick a nominator whose only target would go', async () => {
        const { module, called } = txClient([ALICE, BOB], 1_000_000_000, {
            nominations: { [BOB]: [ALICE] },
        });
        await expect(module.kick([BOB], signer)).rejects.toThrow('only target');
        expect(called('Staking.kick')).toBe(false);
    });
});

describe('StakingModule reads', () => {
    it('reads an account: ledger, payee, roles and keys', async () => {
        const key = (k: string) => `key:${k}`;
        const client = {
            getDynamicBuilder: vi.fn().mockResolvedValue({
                buildStorage: () => ({ keys: { enc: key } }),
            }),
            request: vi.fn().mockResolvedValue('0x00'),
            unsafe: {
                query: {
                    Staking: {
                        Ledger: {
                            getValue: vi.fn().mockResolvedValue({
                                total: 5n,
                                active: 3n,
                                unlocking: [{ value: 2n, era: 9 }],
                            }),
                        },
                        Payee: {
                            getValue: vi.fn().mockResolvedValue({ type: 'Account', value: BOB }),
                        },
                        Nominators: { getValue: vi.fn().mockResolvedValue(undefined) },
                        Validators: {
                            getValue: vi.fn().mockResolvedValue({ commission: 10, blocked: false }),
                        },
                    },
                    Session: {
                        NextKeys: {
                            getValue: vi.fn().mockResolvedValue({
                                aura: '0x' + '01'.repeat(32),
                                grandpa: '0x' + '02'.repeat(32),
                            }),
                        },
                    },
                },
            },
        } as unknown as SubstrateClient;
        const account = await new StakingModule(client).account(ALICE);
        expect(client.request).toHaveBeenCalledWith('state_getStorage', [key(ALICE)]);
        expect(account).toEqual({
            stash: ALICE,
            ledger: { total: 5n, active: 3n, unlocking: [{ value: 2n, era: 9 }] },
            payee: { type: 'Account', account: BOB },
            nominations: null,
            validatorPrefs: { commission: 10, blocked: false },
            sessionKeys: '0x' + '01'.repeat(32) + '02'.repeat(32),
        });
    });

    it('reads no validator prefs when the account does not validate', async () => {
        const client = {
            getDynamicBuilder: vi
                .fn()
                .mockResolvedValue({ buildStorage: () => ({ keys: { enc: () => 'k' } }) }),
            request: vi.fn().mockResolvedValue(null),
            unsafe: {
                query: {
                    Staking: {
                        Ledger: { getValue: vi.fn().mockResolvedValue(undefined) },
                        Payee: { getValue: vi.fn().mockResolvedValue(undefined) },
                        Nominators: {
                            getValue: vi
                                .fn()
                                .mockResolvedValue({ targets: [BOB], submitted_in: 4 }),
                        },
                        Validators: {
                            getValue: vi.fn().mockResolvedValue({ commission: 0, blocked: false }),
                        },
                    },
                    Session: { NextKeys: { getValue: vi.fn().mockResolvedValue(undefined) } },
                },
            },
        } as unknown as SubstrateClient;
        const account = await new StakingModule(client).account(ALICE);
        expect(account.validatorPrefs).toBeNull();
        expect(account.ledger).toBeNull();
        expect(account.sessionKeys).toBeNull();
        expect(account.nominations).toEqual({ targets: [BOB], submittedIn: 4 });
    });

    it('reads the config with the active era’s start, or null without it', async () => {
        const config = (era: unknown) => {
            const value = <T>(v: T) => ({ getValue: vi.fn().mockResolvedValue(v) });
            const client = {
                unsafe: {
                    query: {
                        Staking: {
                            ActiveEra: value(era),
                            CurrentEra: value(era ? 8 : undefined),
                            MinNominatorBond: value(10n),
                            MinValidatorBond: value(20n),
                            MinCommission: value(5),
                            MaxCommission: value(100_000_000),
                        },
                    },
                    constants: {
                        Staking: {
                            BondingDuration: vi.fn().mockResolvedValue(28),
                            HistoryDepth: vi.fn().mockResolvedValue(84),
                            SessionsPerEra: vi.fn().mockResolvedValue(6),
                        },
                    },
                },
            } as unknown as SubstrateClient;
            return new StakingModule(client).config();
        };
        expect(await config({ index: 7, start: 1_700_000_000_000n })).toEqual({
            activeEra: 7,
            activeEraStartMs: 1_700_000_000_000,
            plannedEra: 8,
            minNominatorBond: 10n,
            minValidatorBond: 20n,
            minCommission: 5,
            maxCommission: 100_000_000,
            bondingDuration: 28,
            historyDepth: 84,
            sessionsPerEra: 6,
        });
        expect(await config({ index: 7, start: undefined })).toMatchObject({
            activeEra: 7,
            activeEraStartMs: null,
        });
        expect(await config(undefined)).toMatchObject({
            activeEra: null,
            activeEraStartMs: null,
            plannedEra: null,
        });
    });

    it('scans pending payouts per validator and era', async () => {
        const pending = vi.fn(async (era: number, who: string) => who === ALICE && era % 2 === 0);
        const client = {
            unsafe: { apis: { StakingApi: { pending_rewards: pending } } },
        } as unknown as SubstrateClient;
        const found = await new StakingModule(client).pendingPayouts(
            [ALICE, BOB],
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        );
        expect(found).toEqual([2, 4, 6, 8, 10].map((era) => ({ validator: ALICE, era })));
        expect(pending).toHaveBeenCalledTimes(20);
    });

    it('reads a ban and the allowlist', async () => {
        const client = {
            unsafe: {
                query: {
                    ValidatorSet: {
                        Mode: { getValue: vi.fn().mockResolvedValue({ type: 'Open' }) },
                        ApprovedValidators: { getValue: vi.fn().mockResolvedValue([ALICE]) },
                        Bans: {
                            getValue: vi.fn().mockResolvedValue({ type: 'Until', value: 500 }),
                        },
                    },
                    System: { Number: { getValue: vi.fn().mockResolvedValue(100) } },
                },
                constants: { System: { Version: async () => ({ spec_name: 'orbinum' }) } },
            },
        } as unknown as SubstrateClient;
        expect(await new StakingModule(client).admission(ALICE)).toEqual({
            mode: 'Open',
            approved: true,
            ban: { until: 500 },
            now: 101,
            openFloor: OPEN_MODE_MIN_SELF_BOND,
        });
    });
});
