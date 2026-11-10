import { describe, it, expect } from 'vitest';
import {
    candidacyChecklist,
    candidacyRejection,
    changesApplyFrom,
    claimableEras,
    firstCandidacyFailure,
    isBanned,
    minSelfBond,
} from '../../../../src/chain/pallet/staking/admission';
import {
    ERA_FEE_POOL_ACCOUNT,
    FAST_RUNTIME_OPEN_MODE_MIN_SELF_BOND,
    GOVERNANCE_ACCOUNT,
    OPEN_MODE_MIN_SELF_BOND,
    PERBILL,
    openModeMinSelfBond,
} from '../../../../src/chain/pallet/staking/constants';
import type { Admission, StakingAccount } from '../../../../src/chain/pallet/staking/types/index';

const ORB = 10n ** 18n;
const MIN = 1_000n * ORB;

const account = (over: Partial<StakingAccount> = {}): StakingAccount => ({
    stash: 'x',
    ledger: { total: MIN, active: MIN, unlocking: [] },
    payee: { type: 'Staked' },
    nominations: null,
    validatorPrefs: null,
    sessionKeys: '0x' + '00'.repeat(64),
    ...over,
});
const admission = (over: Partial<Admission> = {}): Admission => ({
    mode: 'Permissioned',
    approved: true,
    ban: null,
    now: 100,
    openFloor: OPEN_MODE_MIN_SELF_BOND,
    ...over,
});
const failure = (a: StakingAccount, adm: Admission, commission = 0, maxCommission = PERBILL) =>
    firstCandidacyFailure(
        candidacyChecklist(a, adm, { minValidatorBond: MIN, maxCommission }, commission)
    );

describe('candidacyChecklist', () => {
    it('passes a bonded, approved, keyed candidate', () => {
        expect(failure(account(), admission())).toBeNull();
    });

    it('fails in the runtime’s order, each condition on its own', () => {
        expect(failure(account({ ledger: null }), admission({ approved: false }))).toBe(
            'NotBonded'
        );
        expect(failure(account(), admission({ ban: 'permanent', approved: false }))).toBe('Banned');
        expect(failure(account(), admission({ approved: false }))).toBe('NotApproved');
        expect(failure(account({ sessionKeys: null }), admission())).toBe('NoSessionKeys');
        const low = account({ ledger: { total: MIN, active: MIN - 1n, unlocking: [] } });
        expect(failure(low, admission())).toBe('InsufficientSelfBond');
        expect(failure(account(), admission(), 200_000_001, 200_000_000)).toBe('CommissionTooHigh');
        expect(failure(account(), admission(), 200_000_000, 200_000_000)).toBeNull();
        // No ceiling on-chain: any commission.
        expect(failure(account(), admission(), PERBILL)).toBeNull();
    });

    it('ignores the allowlist but raises the bond floor while open', () => {
        expect(failure(account(), admission({ mode: 'Open', approved: false }))).toBe(
            'InsufficientSelfBond'
        );
        const rich = account({
            ledger: {
                total: OPEN_MODE_MIN_SELF_BOND,
                active: OPEN_MODE_MIN_SELF_BOND,
                unlocking: [],
            },
        });
        expect(failure(rich, admission({ mode: 'Open', approved: false }))).toBeNull();
        expect(minSelfBond('Open', MIN)).toBe(OPEN_MODE_MIN_SELF_BOND);
        expect(minSelfBond('Open', 2n * OPEN_MODE_MIN_SELF_BOND)).toBe(
            2n * OPEN_MODE_MIN_SELF_BOND
        );
        expect(minSelfBond('Permissioned', MIN)).toBe(MIN);
    });

    it("takes the open floor of the runtime it reads, not production's", () => {
        const fast = admission({ mode: 'Open', openFloor: openModeMinSelfBond('orbinum-fast') });
        expect(failure(account(), fast)).toBeNull();
        expect(openModeMinSelfBond('orbinum')).toBe(OPEN_MODE_MIN_SELF_BOND);
        expect(openModeMinSelfBond('orbinum-fast')).toBe(FAST_RUNTIME_OPEN_MODE_MIN_SELF_BOND);
        expect(minSelfBond('Open', 1n, FAST_RUNTIME_OPEN_MODE_MIN_SELF_BOND)).toBe(
            FAST_RUNTIME_OPEN_MODE_MIN_SELF_BOND
        );
    });

    it('reads a ban as expired from its ending block on', () => {
        expect(isBanned(admission({ ban: { until: 101 } }))).toBe(true);
        expect(isBanned(admission({ ban: { until: 100 } }))).toBe(false);
        expect(isBanned(admission({ ban: 'permanent' }))).toBe(true);
    });
});

describe('changesApplyFrom', () => {
    it('counts from the era after the latest planned one', () => {
        // Next era not planned yet: its election still takes the change.
        expect(changesApplyFrom({ activeEra: 7, plannedEra: 7 })).toBe(8);
        // Era 8's election started: the change counts from era 9.
        expect(changesApplyFrom({ activeEra: 7, plannedEra: 8 })).toBe(9);
        expect(changesApplyFrom({ activeEra: null, plannedEra: null })).toBeNull();
    });
});

describe('claimableEras', () => {
    it('runs from the oldest era staking keeps to the last closed one', () => {
        // Era 101 planned: era 16 already left staking's 84-era history.
        expect(claimableEras({ activeEra: 100, plannedEra: 101, historyDepth: 84 })).toEqual({
            from: 17,
            to: 99,
        });
        expect(claimableEras({ activeEra: 3, plannedEra: 3, historyDepth: 84 })).toEqual({
            from: 0,
            to: 2,
        });
        expect(claimableEras({ activeEra: 0, plannedEra: 0, historyDepth: 84 })).toBeNull();
    });
});

describe('candidacyRejection', () => {
    it('reads the code from PAPI’s invalid-transaction error', () => {
        const err = Object.assign(new Error('{}'), {
            error: { type: 'Invalid', value: { type: 'Custom', value: 3 } },
        });
        expect(candidacyRejection(err)).toBe('NoSessionKeys');
    });

    it('reads the code from a message', () => {
        expect(candidacyRejection(new Error('Invalid Transaction: Custom error: 4'))).toBe(
            'InsufficientSelfBond'
        );
        expect(candidacyRejection('{"type":"Custom","value":1}')).toBe('NotApproved');
    });

    it('reads a full candidate list (code 7)', () => {
        expect(candidacyRejection({ type: 'Invalid', value: { type: 'Custom', value: 7 } })).toBe(
            'TooManyCandidates'
        );
        expect(candidacyRejection(new Error('Invalid Transaction: Custom error: 7'))).toBe(
            'TooManyCandidates'
        );
    });

    it('reads session keys in use (code 8)', () => {
        expect(candidacyRejection({ type: 'Invalid', value: { type: 'Custom', value: 8 } })).toBe(
            'SessionKeysInUse'
        );
    });

    it('is null for other errors and unknown codes', () => {
        expect(candidacyRejection(new Error('Module(Staking.InsufficientBond)'))).toBeNull();
        expect(candidacyRejection({ type: 'Custom', value: 9 })).toBeNull();
        expect(candidacyRejection({ type: 'Custom', value: 42 })).toBeNull();
        expect(candidacyRejection(undefined)).toBeNull();
    });
});

describe('keyless accounts', () => {
    it('match the runtime’s PalletId accounts', () => {
        // The fee pool as the local network reports it (`orb/feep`).
        expect(ERA_FEE_POOL_ACCOUNT).toBe('5EYCAe5iXnakC7cHHXU2dakFt2yzq3mCRkzZcJShnnKiqhkc');
        expect(GOVERNANCE_ACCOUNT).toBe('5EYCAe5ijiYfyeZ2JJCGq56LmPyNRAKzpG4QkoQkkQNB5e6Z');
    });
});
