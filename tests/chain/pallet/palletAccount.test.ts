/** Pallet accounts and the runtime's PalletIds. */
import { describe, expect, it } from 'vitest';
import { encodeAddress } from '@polkadot/util-crypto';
import {
    ISMP_TREASURY_ACCOUNT,
    ORBINUM_PALLET_IDS,
    SHIELDED_POOL_ACCOUNT,
    palletAccountId,
} from '../../../src/chain/pallet/palletAccount';
import { isPalletAccount } from '../../../src/foundation/address';
import { privateShareAssetMetadata } from '../../../src/chain/pallet/private-staking/account';

/** `PalletId::into_account_truncating`, spelled out. */
const modl = (id: string) => {
    const bytes = new Uint8Array(32);
    bytes.set(new TextEncoder().encode(`modl${id}`));
    return encodeAddress(bytes, 42);
};

describe('pallet accounts', () => {
    it('are modl ‖ PalletId, zero-padded', () => {
        expect(SHIELDED_POOL_ACCOUNT).toBe(modl('shld/pol'));
        expect(ISMP_TREASURY_ACCOUNT).toBe(modl('orb/ismp'));
        expect(palletAccountId('orb/feep')).toMatch(/^0x6d6f646c6f72622f66656570(00){20}$/);
    });

    it('every PalletId is 8 bytes and unique', () => {
        const ids = Object.values(ORBINUM_PALLET_IDS);
        expect(ids.every((id) => new TextEncoder().encode(id).length === 8)).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('isPalletAccount tells a pallet account from an EVM-mapped one', () => {
        expect(isPalletAccount(SHIELDED_POOL_ACCOUNT)).toBe(true);
        expect(isPalletAccount(palletAccountId('orb/pool'))).toBe(true);
        const evmMapped = '0x' + 'ab'.repeat(20) + '00'.repeat(12);
        expect(isPalletAccount(evmMapped)).toBe(false);
        expect(isPalletAccount('not an account')).toBe(false);
    });
});

describe('privateShareAssetMetadata', () => {
    it('is what the runtime registers for a pool', () => {
        expect(privateShareAssetMetadata(7)).toEqual({
            name: 'Private stake in pool #7',
            symbol: 's7',
            decimals: 18,
        });
    });
});
