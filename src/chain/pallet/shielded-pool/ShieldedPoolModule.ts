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
import { MemoFormat } from '../../../protocol/memo/index';
import { accountIdHexToSs58 } from '../../../foundation/address';
import type {
    ShieldParams,
    UnshieldParams,
    PrivateTransferParams,
    ShieldBatchParams,
    ClaimRelayFeesParams,
} from './extrinsicParams';
import { assertClaimRelayFeesParams } from './validation';

// ─── ShieldedPoolModule ───────────────────────────────────────────────────────

/**
 * High-level module for Orbinum shielded-pool operations.
 *
 * Transactions are built via polkadot-api's UnsafeApi (metadata-driven),
 * which means the Orbinum node must be reachable on first use.
 * Signing is delegated to a SubstrateSigner (see polkadot-api/signer).
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
     * Extrinsic: shieldedPool.shield(assetId, amount, commitment, encryptedMemo)
     *
     * Shield is always a signed (public) transaction — the caller's address
     * appears on-chain as the depositor.
     */
    async shield(
        params: ShieldParams,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ): Promise<TxResult> {
        MemoFormat.validate(params.encryptedMemo, 'shield.encryptedMemo');
        const entry = resolveTx(this.substrate.unsafe, 'ShieldedPool', 'shield');
        const tx = callUnsafeTx(entry, {
            asset_id: params.assetId,
            amount: params.amount,
            commitment: params.commitment,
            encrypted_memo: params.encryptedMemo,
        });
        return signAndSubmitTx(tx, signer, options);
    }

    /**
     * Withdraws tokens from the shielded pool to a public address.
     * Submits as an UNSIGNED (gasless) transaction — fee is embedded in the ZK proof.
     * Pass a `signer` to fall back to signed submission (e.g. for testing).
     * Extrinsic: shieldedPool.unshield(proof, merkleRoot, nullifier, assetId, amount, recipient, fee, changeCommitment, changeEncryptedMemo, circuitVersion)
     *
     * The relay fee recipient is NOT a parameter: the chain takes it from the
     * dispatch origin. Submitting unsigned credits the block author; submitting
     * through the EVM precompile credits whoever signed that transaction.
     */
    async unshield(
        params: UnshieldParams,
        signer?: SubstrateSigner,
        options?: SubmitOptions
    ): Promise<TxResult> {
        const entry = resolveTx(this.substrate.unsafe, 'ShieldedPool', 'unshield');
        // AccountId32 codec in PAPI expects SS58 string — convert from hex
        const recipientSs58 = accountIdHexToSs58(params.recipientAddress);
        if (!recipientSs58) throw new Error(`Invalid recipientAddress: ${params.recipientAddress}`);
        const changeCommitment = params.changeCommitment ?? '0x' + '00'.repeat(32);

        // Validate and encode change_encrypted_memo (if provided)
        let changeEncryptedMemo: Uint8Array;
        if (params.changeEncryptedMemo && params.changeEncryptedMemo.length > 0) {
            MemoFormat.validate(params.changeEncryptedMemo, 'changeEncryptedMemo');
            changeEncryptedMemo = params.changeEncryptedMemo;
        } else {
            // Empty memo for total unshield
            changeEncryptedMemo = new Uint8Array(0);
        }

        const tx = callUnsafeTx(entry, {
            proof: params.proof,
            merkle_root: params.merkleRoot,
            nullifier: params.nullifier,
            asset_id: params.assetId,
            amount: params.amount,
            recipient: recipientSs58,
            fee: params.fee ?? 0n,
            change_commitment: changeCommitment,
            change_encrypted_memo: changeEncryptedMemo,
            circuit_version: params.circuitVersion,
        });
        if (signer) {
            return signAndSubmitTx(tx, signer, options);
        }
        return submitBareTx(tx, this.substrate, options?.onBroadcast);
    }

    /**
     * Performs a private (shielded) transfer between two notes.
     * Submits as an UNSIGNED (gasless) transaction — fee is embedded in the ZK proof.
     * Pass a `signer` to fall back to signed submission (e.g. for testing).
     * Extrinsic: shieldedPool.privateTransfer(proof, merkleRoot, nullifiers, commitments, memos, assetId, fee, circuitVersion)
     *
     * The relay fee recipient is NOT a parameter: the chain takes it from the
     * dispatch origin. Submitting unsigned credits the block author; submitting
     * through the EVM precompile credits whoever signed that transaction.
     */
    async privateTransfer(
        params: PrivateTransferParams,
        signer?: SubstrateSigner,
        options?: SubmitOptions
    ): Promise<TxResult> {
        const nullifiers = params.inputs.map((inp) => inp.nullifier);
        const commitments = params.outputs.map((out) => out.commitment);
        const memos = params.outputs.map((out, i) => {
            MemoFormat.validate(out.encryptedMemo, `privateTransfer.outputs[${i}].encryptedMemo`);
            return out.encryptedMemo;
        });

        const entry = resolveTx(this.substrate.unsafe, 'ShieldedPool', 'private_transfer');
        const tx = callUnsafeTx(entry, {
            proof: params.proof,
            merkle_root: params.merkleRoot,
            nullifiers,
            commitments,
            encrypted_memos: memos,
            asset_id: params.assetId,
            fee: params.fee ?? 0n,
            circuit_version: params.circuitVersion,
        });
        if (signer) {
            return signAndSubmitTx(tx, signer, options);
        }
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
        const operations = params.items.map((item, i) => {
            MemoFormat.validate(item.encryptedMemo, `shieldBatch.items[${i}].encryptedMemo`);
            return {
                assetId: item.assetId,
                amount: item.amount.toString(),
                commitment: item.commitment,
                encryptedMemo: item.encryptedMemo,
            };
        });
        const entry = resolveTx(this.substrate.unsafe, 'ShieldedPool', 'shield_batch');
        const tx = callUnsafeTx(entry, operations);
        return signAndSubmitTx(tx, signer, options);
    }

    /**
     * Claims the signer's pending relay fees, publicly. A registered relayer is
     * paid at the account of its EVM address; an unregistered signer at its own
     * account. Bounded by the signer's pending balance — no proof, no note.
     *
     * Extrinsic: shieldedPool.claim_relay_fees(asset_id, amount).
     */
    async claimRelayFees(
        params: ClaimRelayFeesParams,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ): Promise<TxResult> {
        assertClaimRelayFeesParams(params, 'claimRelayFees');
        const entry = resolveTx(this.substrate.unsafe, 'ShieldedPool', 'claim_relay_fees');
        const tx = callUnsafeTx(entry, { asset_id: params.assetId, amount: params.amount });
        return signAndSubmitTx(tx, signer, options);
    }
}
