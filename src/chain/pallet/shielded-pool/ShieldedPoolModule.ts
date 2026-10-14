import type { SignerTxCreator as SubstrateSigner } from 'polkadot-api/tx-creator';
import type { SubstrateClient } from '../../substrate/SubstrateClient';
import type { TxResult } from '../../client/types';
import {
    callUnsafeTx,
    resolveTx,
    signAndSubmitTx,
    submitBareTx,
    type SubmitOptions,
} from '../../tx';
import type {
    ShieldParams,
    UnshieldParams,
    PrivateTransferParams,
    ShieldBatchParams,
    ClaimFeesParams,
} from './types/index';
import {
    claimFeesCallArgs,
    privateTransferCallArgs,
    shieldBatchCallArgs,
    shieldCallArgs,
    unshieldCallArgs,
} from './calls/index';
import { readIsKnownRoot, readMinSpendFee, readPendingFees } from './storage/index';

// ─── ShieldedPoolModule ───────────────────────────────────────────────────────

/**
 * High-level module for Orbinum shielded-pool operations.
 *
 * Transactions are built via polkadot-api's UnsafeApi (metadata-driven),
 * which means the Orbinum node must be reachable on first use.
 * Signing is delegated to a SubstrateSigner (see polkadot-api/signer). Spends
 * (`privateTransfer`, `unshield`) are never signed: the runtime accepts them
 * only unsigned, so no account is linked to a spend's nullifiers.
 *
 * Arguments are passed BY NAME through PAPI, so the field names — not the
 * order — have to match the runtime's. A renamed parameter fails at
 * encoding rather than silently shifting a value into the wrong slot.
 */
export class ShieldedPoolModule {
    constructor(private readonly substrate: SubstrateClient) {}

    // ─── Extrinsics ────────────────────────────────────────────────────────────

    /**
     * Deposits tokens into the shielded pool.
     * Extrinsic: shieldedPool.shield(assetId, amount, commitment, encryptedMemo, proof, circuitVersion)
     *
     * Shield is always a signed (public) transaction — the caller's address
     * appears on-chain as the depositor. The proof binds the commitment to the
     * deposited amount and asset.
     */
    async shield(
        params: ShieldParams,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ): Promise<TxResult> {
        const args = shieldCallArgs(params);
        const entry = resolveTx(this.substrate.unsafe, 'ShieldedPool', 'shield');
        const tx = callUnsafeTx(entry, args);
        return signAndSubmitTx(tx, signer, options);
    }

    /**
     * Withdraws tokens from the shielded pool to a public address.
     * Extrinsic: shieldedPool.unshield(proof, merkleRoot, nullifier, assetId, amount, recipient, fee, changeCommitment, changeEncryptedMemo, circuitVersion)
     *
     * Always submitted UNSIGNED: the fee is a public input of the proof, and the
     * runtime refuses a signed spend with `BadOrigin`. The fee is credited to
     * the block author's validator account (`FeeCredited`). Of `options`, only
     * `onBroadcast` applies: an unsigned extrinsic has no signed extensions.
     */
    async unshield(params: UnshieldParams, options?: SubmitOptions): Promise<TxResult> {
        const args = unshieldCallArgs(params);
        const entry = resolveTx(this.substrate.unsafe, 'ShieldedPool', 'unshield');
        const tx = callUnsafeTx(entry, args);
        return submitBareTx(tx, this.substrate, options?.onBroadcast);
    }

    /**
     * Performs a private (shielded) transfer between two notes.
     * Extrinsic: shieldedPool.privateTransfer(proof, merkleRoots, nullifiers, commitments, memos, assetId, fee, circuitVersion)
     *
     * Always submitted UNSIGNED, like `unshield`: the fee is a public input of
     * the proof and is credited to the block author's validator account.
     */
    async privateTransfer(
        params: PrivateTransferParams,
        options?: SubmitOptions
    ): Promise<TxResult> {
        const args = privateTransferCallArgs(params);
        const entry = resolveTx(this.substrate.unsafe, 'ShieldedPool', 'private_transfer');
        const tx = callUnsafeTx(entry, args);
        return submitBareTx(tx, this.substrate, options?.onBroadcast);
    }

    /**
     * Deposits multiple notes into the shielded pool in a single extrinsic.
     * Extrinsic: shieldedPool.shieldBatch(operations) — max 20 items.
     */
    async shieldBatch(
        params: ShieldBatchParams,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ): Promise<TxResult> {
        const args = shieldBatchCallArgs(params);
        const entry = resolveTx(this.substrate.unsafe, 'ShieldedPool', 'shield_batch');
        const tx = callUnsafeTx(entry, args);
        return signAndSubmitTx(tx, signer, options);
    }

    /**
     * Pays the signer's own pending spend fees out of the pool to the signer,
     * publicly. Bounded by `pendingFees(signer, assetId)` — no proof, no note.
     * Claiming more fails with `InsufficientPendingFees`.
     *
     * Extrinsic: shieldedPool.claim_fees(asset_id, amount).
     */
    async claimFees(
        params: ClaimFeesParams,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ): Promise<TxResult> {
        const args = claimFeesCallArgs(params);
        const entry = resolveTx(this.substrate.unsafe, 'ShieldedPool', 'claim_fees');
        const tx = callUnsafeTx(entry, args);
        return signAndSubmitTx(tx, signer, options);
    }

    // ─── Storage & constants ───────────────────────────────────────────────────

    /**
     * Spend fees credited to `account` in `assetId` and not yet claimed, in
     * planck (`ShieldedPool.PendingFees`). Every spend's fee is credited to the
     * validator account of the block's author; zero for any other account.
     *
     * `account` is an SS58 address or a 0x-prefixed AccountId32 hex (an EVM H160
     * reads its mapped account).
     */
    pendingFees(account: string, assetId: number): Promise<bigint> {
        return readPendingFees(this.substrate, account, assetId);
    }

    /**
     * The runtime's floor on a spend's fee, in planck (`ShieldedPool.MinSpendFee`).
     * Changes only with a runtime upgrade; `MIN_SPEND_FEE` is its current value.
     */
    minSpendFee(): Promise<bigint> {
        return readMinSpendFee(this.substrate);
    }

    /**
     * Whether a spend anchored at `root` (0x hex, as a proof carries it) would
     * be accepted: the active root, a historic root with at least
     * `minBlocksLeft` blocks of its retention window left, or a sealed tree's
     * final root. Every insert's root is kept for `RootRetentionBlocks`, so a
     * wallet may prove against the tree at an earlier size.
     */
    isKnownRoot(
        root: string,
        options: { minBlocksLeft?: number | undefined } = {}
    ): Promise<boolean> {
        return readIsKnownRoot(this.substrate, root, options.minBlocksLeft ?? 0);
    }
}
