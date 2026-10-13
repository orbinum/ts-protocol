/**
 * Bindings for the `ShieldedPoolPrecompile` at address `0x...0801`.
 *
 * Only `shield` is live: the precompile dispatches it on behalf of the EVM
 * caller (resolved to an AccountId32 via `EeSuffixAddressMapping`), so an
 * EVM-only user can shield without a Polkadot extension. Spends are not here:
 * they are accepted only as unsigned Substrate extrinsics
 * (`ShieldedPoolModule.privateTransfer` / `unshield`).
 *
 * This class is TRANSPORT only: the precompile address, the signer callback and
 * gas estimation. The calldata is built by `shieldedPoolCalldata`.
 */
import type { EvmClient } from '../EvmClient';
import type { ShieldParams } from '../../pallet/shielded-pool/types/index';
import type { EvmSigner } from './types';
import { PRECOMPILE_ADDR } from './addresses';
import { buildShieldCalldata } from './shieldedPoolCalldata';

export class ShieldedPoolPrecompile {
    private readonly addr = PRECOMPILE_ADDR.SHIELDED_POOL;

    constructor(private readonly evm: EvmClient) {}

    /**
     * Deposits tokens into the shielded pool from a payable EVM transaction.
     *
     * The amount rides as `msg.value` so EVM wallets show the correct figure on
     * the confirmation screen. The precompile then dispatches with its OWN
     * address as origin, so funds flow caller → precompile → pool. That avoids
     * a double deduction while keeping the displayed amount accurate.
     *
     * Extrinsic: `shieldedPool.shield(assetId, amount, commitment, encryptedMemo, proof, circuitVersion)`
     */
    async shield(params: ShieldParams, signer: EvmSigner): Promise<string> {
        return signer({
            to: this.addr,
            data: buildShieldCalldata(params),
            value: params.amount,
        });
    }

    /**
     * Gas for `shield` from `from`, which must be the real sender: the
     * precompile resolves it to an AccountId32, so estimating from a different
     * address measures a different call.
     */
    async estimateShieldGas(params: ShieldParams, from: string): Promise<bigint> {
        // `value` too, not just the calldata: `shield` is payable and the
        // precompile takes the amount from `msg.value`, rejecting zero outright.
        // Estimating without it reverts every time — an estimate that can never
        // succeed, for a call that would.
        return this.evm.estimateGas({
            from,
            to: this.addr,
            data: buildShieldCalldata(params),
            value: `0x${params.amount.toString(16)}`,
        });
    }
}
