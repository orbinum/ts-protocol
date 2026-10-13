/**
 * `ShieldedPool` storage and constants, read through PAPI's UnsafeApi.
 *
 * The UnsafeApi is untyped; `ShieldedPoolReads` is the slice of it these reads
 * use, so a renamed storage item fails here rather than at every call site.
 */
import type { SubstrateClient } from '../../../substrate/SubstrateClient';
import { accountIdHexToSs58, addressToAccountIdHex } from '../../../../foundation/address';
import { assertU32 } from '../calls/validation';

/** The slice of PAPI's UnsafeApi the shielded-pool reads use. */
type ShieldedPoolReads = {
    query: {
        ShieldedPool: {
            PendingFees: {
                getValue(account: string, assetId: number): Promise<bigint | number | string>;
            };
        };
    };
    constants: { ShieldedPool: { MinSpendFee(): Promise<bigint | number | string> } };
};

function poolReads(substrate: SubstrateClient): ShieldedPoolReads {
    return substrate.unsafe as unknown as ShieldedPoolReads;
}

/**
 * Spend fees credited to `account` in `assetId` and not yet claimed, in planck
 * (`ShieldedPool.PendingFees`). `account` is an SS58 address or a 0x-prefixed
 * AccountId32 hex (an EVM H160 reads its mapped account).
 */
export async function readPendingFees(
    substrate: SubstrateClient,
    account: string,
    assetId: number
): Promise<bigint> {
    const accountHex = addressToAccountIdHex(account);
    const ss58 = accountHex ? accountIdHexToSs58(accountHex) : null;
    if (!ss58) throw new Error(`pendingFees.account: not an account address: ${account}`);
    assertU32(assetId, 'pendingFees.assetId');
    return BigInt(
        await poolReads(substrate).query.ShieldedPool.PendingFees.getValue(ss58, assetId)
    );
}

/** The runtime's floor on a spend's fee, in planck (`ShieldedPool.MinSpendFee`). */
export async function readMinSpendFee(substrate: SubstrateClient): Promise<bigint> {
    return BigInt(await poolReads(substrate).constants.ShieldedPool.MinSpendFee());
}
