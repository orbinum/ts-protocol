import { describe, expect, it } from 'vitest';
import {
    poolDepositorMinBond,
    poolUnbondCap,
} from '../../../../src/chain/pallet/nomination-pools/rules';

const ORB = 10n ** 18n;
const config = { minJoinBond: 2n * ORB, minCreateBond: 10n * ORB } as never;
const DEPOSITOR = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const MEMBER = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const pool = (state = 'Open', memberCount = 3) =>
    ({ roles: { depositor: DEPOSITOR }, state, memberCount }) as never;

describe('nomination pool depositor rules', () => {
    it('the depositor keeps the highest of the nominator, create and join minimums', () => {
        expect(poolDepositorMinBond(config, ORB)).toBe(10n * ORB);
        expect(poolDepositorMinBond(config, 50n * ORB)).toBe(50n * ORB);
    });

    it('caps only the depositor, until the pool is destroying and it is alone', () => {
        const member = (account: string) => ({ account, active: 30n * ORB });
        expect(poolUnbondCap(member(MEMBER), pool(), config, ORB)).toBe(30n * ORB);
        expect(poolUnbondCap(member(DEPOSITOR), pool(), config, ORB)).toBe(20n * ORB);
        expect(poolUnbondCap(member(DEPOSITOR), pool('Destroying', 1), config, ORB)).toBe(
            30n * ORB
        );
        // Same account, given as AccountId32 hex.
        const hex = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';
        expect(poolUnbondCap(member(hex), pool(), config, ORB)).toBe(20n * ORB);
    });
});
