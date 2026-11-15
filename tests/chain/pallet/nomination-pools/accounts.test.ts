import { describe, it, expect } from 'vitest';
import {
    poolAccounts,
    poolOfBondedAccount,
} from '../../../../src/chain/pallet/nomination-pools/index';
import {
    privateMemberAccountId,
    privateMemberAddress,
    privateMemberPoolId,
} from '../../../../src/chain/pallet/private-staking/index';
import { substrateSs58ToAccountIdHex } from '../../../../src/foundation/address';

describe('poolAccounts', () => {
    it('derives the bonded and reward accounts as the pools pallet does', () => {
        const { bonded, reward } = poolAccounts(1);
        // "modl" ‖ "orb/pool" ‖ type ‖ u32_le(1), zero-padded.
        expect(substrateSs58ToAccountIdHex(bonded)).toBe(
            '0x6d6f646c6f72622f706f6f6c0001000000000000000000000000000000000000'
        );
        expect(substrateSs58ToAccountIdHex(reward)).toBe(
            '0x6d6f646c6f72622f706f6f6c0101000000000000000000000000000000000000'
        );
        expect(poolOfBondedAccount(bonded)).toBe(1);
        expect(poolOfBondedAccount(reward)).toBeNull();
        expect(poolOfBondedAccount(privateMemberAddress(1))).toBeNull();
    });
});

describe('privateMemberPoolId', () => {
    it('inverts privateMemberAccountId, in SS58 or hex', () => {
        expect(privateMemberPoolId(privateMemberAddress(42))).toBe(42);
        expect(privateMemberPoolId(privateMemberAccountId(7))).toBe(7);
    });

    it('refuses other accounts and the pallet account itself', () => {
        expect(privateMemberPoolId(privateMemberAccountId(0))).toBeNull();
        expect(privateMemberPoolId(poolAccounts(1).bonded)).toBeNull();
        expect(privateMemberPoolId('not an address')).toBeNull();
        expect(privateMemberPoolId(null)).toBeNull();
    });
});
