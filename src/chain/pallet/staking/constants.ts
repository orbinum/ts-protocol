/**
 * Runtime parameters a client checks before signing, mirrored from
 * `node/template/runtime/src/staking/params.rs`. The chain stays the authority:
 * these only spare a person a rejected transaction.
 */
import { accountIdHexToSs58 } from '../../../foundation/address';
import { toHex } from '../../../foundation/encoding/hex';

/** `Perbill` parts in 100 %. */
export const PERBILL = 1_000_000_000;

/** `MaxNominations`: targets per nominator. */
export const MAX_NOMINATIONS = 16;

/** `OPEN_MODE_MIN_SELF_BOND`: the self-bond floor while admission is open, in planck (100 000 ORB). */
export const OPEN_MODE_MIN_SELF_BOND = 100_000n * 10n ** 18n;

/** The open floor of a `fast-runtime` build (`spec_name` `orbinum-fast`): 1 000 ORB. */
export const FAST_RUNTIME_OPEN_MODE_MIN_SELF_BOND = 1_000n * 10n ** 18n;

/** The open floor of the runtime named `specName`. */
export function openModeMinSelfBond(specName: string): bigint {
    return specName === 'orbinum-fast'
        ? FAST_RUNTIME_OPEN_MODE_MIN_SELF_BOND
        : OPEN_MODE_MIN_SELF_BOND;
}

/** `PalletId::into_account_truncating`: `modl` ++ the 8-byte id, zero-padded to 32 bytes. */
function palletAccount(id: string): string {
    const bytes = new Uint8Array(32);
    bytes.set(new TextEncoder().encode(`modl${id}`));
    return accountIdHexToSs58(toHex(bytes)) as string;
}

/** The account the era's fees collect in until the era pays them out (`orb/feep`). */
export const ERA_FEE_POOL_ACCOUNT = palletAccount('orb/feep');

/** The governance account slashes go to (`py/trsry`). */
export const GOVERNANCE_ACCOUNT = palletAccount('py/trsry');
