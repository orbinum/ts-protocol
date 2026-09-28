/**
 * Bindings for the `ShieldedPoolPrecompile` at address `0x...0801`.
 *
 * This precompile wraps `pallet-shielded-pool` extrinsics and dispatches them
 * on behalf of the EVM caller (resolved to an AccountId32 via
 * `EeSuffixAddressMapping`). No Substrate signer is required — an EVM wallet is
 * sufficient, so EVM-only users can shield, transfer and unshield without ever
 * installing a Polkadot extension.
 *
 * This class is TRANSPORT only: the precompile address, the signer callback and
 * gas estimation. The calldata itself is built by `shieldedPoolCalldata`, which
 * needs no chain connection — import those functions directly for custom
 * signing flows rather than constructing a client you never call.
 */
import type { EvmClient } from '../EvmClient';
import type {
    ShieldParams,
    UnshieldParams,
    PrivateTransferParams,
    ClaimRelayFeesParams,
} from '../../pallet/shielded-pool/extrinsicParams';
import type { EvmSigner } from './types';
import { PRECOMPILE_ADDR } from './addresses';
import {
    buildShieldCalldata,
    buildPrivateTransferCalldata,
    buildUnshieldCalldata,
    buildClaimRelayFeesCalldata,
} from './shieldedPoolCalldata';

export class ShieldedPoolPrecompile {
    private readonly addr = PRECOMPILE_ADDR.SHIELDED_POOL;

    constructor(private readonly evm: EvmClient) {}

    // ─── Calldata ────────────────────────────────────────────────────────────
    //
    // Thin delegates to `shieldedPoolCalldata`, kept because they are public
    // API. New code should import those functions directly: they are pure, so
    // using them needs no `EvmClient` to construct.

    buildShieldCalldata(params: ShieldParams): string {
        return buildShieldCalldata(params);
    }

    buildPrivateTransferCalldata(params: PrivateTransferParams): string {
        return buildPrivateTransferCalldata(params);
    }

    buildUnshieldCalldata(params: UnshieldParams): string {
        return buildUnshieldCalldata(params);
    }

    buildClaimRelayFeesCalldata(params: ClaimRelayFeesParams): string {
        return buildClaimRelayFeesCalldata(params);
    }

    // ─── shield ──────────────────────────────────────────────────────────────

    /**
     * Deposits tokens into the shielded pool from a payable EVM transaction.
     *
     * The amount rides as `msg.value` so EVM wallets show the correct figure on
     * the confirmation screen. The precompile then dispatches with its OWN
     * address as origin, so funds flow caller → precompile → pool. That avoids
     * a double deduction while keeping the displayed amount accurate.
     *
     * Extrinsic: `shieldedPool.shield(assetId, amount, commitment, encryptedMemo)`
     */
    async shield(params: ShieldParams, signer: EvmSigner): Promise<string> {
        return signer({
            to: this.addr,
            data: buildShieldCalldata(params),
            value: params.amount,
        });
    }

    // ─── privateTransfer ─────────────────────────────────────────────────────

    /**
     * Submits a private transfer within the shielded pool.
     *
     * The EVM caller identity is IRRELEVANT to the ZK proof — the sender is
     * hidden by design, so any address (a relayer included) can submit a valid
     * proof.
     *
     * Extrinsic: `shieldedPool.privateTransfer(proof, merkleRoot, nullifiers,
     * commitments, memos, assetId, fee, circuitVersion)` — eight arguments; see
     * `buildPrivateTransferCalldata` for the encoding order.
     */
    async privateTransfer(params: PrivateTransferParams, signer: EvmSigner): Promise<string> {
        return signer({ to: this.addr, data: buildPrivateTransferCalldata(params) });
    }

    // ─── unshield ────────────────────────────────────────────────────────────

    /**
     * Withdraws tokens from the shielded pool to a recipient account.
     *
     * `params.recipientAddress` must be a 0x-prefixed AccountId32. To send to an
     * EVM address, derive it first with `evmToImplicitSubstrate(evmAddr)`.
     *
     * Extrinsic: `shieldedPool.unshield(proof, merkleRoot, nullifier, assetId,
     * amount, recipient, fee, changeCommitment, changeEncryptedMemo,
     * circuitVersion)` — ten arguments; see `buildUnshieldCalldata`.
     *
     * **The relay fee goes to whoever `signer` is.** The chain takes the recipient
     * from `msg.sender`, not from calldata, so the account behind this signer is
     * the one credited — and it is also the one paying gas. Relaying on someone
     * else's behalf and being paid for it is the same act here.
     */
    async unshield(params: UnshieldParams, signer: EvmSigner): Promise<string> {
        return signer({ to: this.addr, data: buildUnshieldCalldata(params) });
    }

    // ─── claimRelayFees ──────────────────────────────────────────────────────

    /**
     * Claims the caller's pending relay fees, publicly.
     *
     * Spends the fees of the account registered to `msg.sender` and pays them
     * to the account of that EVM address. No proof: the claim creates no note,
     * and it is bounded by the claimant's own pending balance.
     *
     * Extrinsic: `shieldedPool.claim_relay_fees(asset_id, amount)`.
     */
    async claimRelayFees(params: ClaimRelayFeesParams, signer: EvmSigner): Promise<string> {
        return signer({ to: this.addr, data: buildClaimRelayFeesCalldata(params) });
    }

    // ─── Gas estimation ──────────────────────────────────────────────────────
    //
    // `from` must be the real sender: the precompile resolves it to an
    // AccountId32, so estimating from a different address measures a different
    // call.

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

    async estimatePrivateTransferGas(params: PrivateTransferParams, from: string): Promise<bigint> {
        return this.evm.estimateGas({
            from,
            to: this.addr,
            data: buildPrivateTransferCalldata(params),
        });
    }

    async estimateUnshieldGas(params: UnshieldParams, from: string): Promise<bigint> {
        return this.evm.estimateGas({ from, to: this.addr, data: buildUnshieldCalldata(params) });
    }

    async estimateClaimRelayFeesGas(params: ClaimRelayFeesParams, from: string): Promise<bigint> {
        return this.evm.estimateGas({
            from,
            to: this.addr,
            data: buildClaimRelayFeesCalldata(params),
        });
    }
}
