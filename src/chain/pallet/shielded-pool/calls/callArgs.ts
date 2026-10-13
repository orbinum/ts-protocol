/**
 * Shielded-pool call arguments in the shape PAPI's metadata-driven API takes.
 *
 * Kept apart from `ShieldedPoolModule` so a host that submits through its own
 * PAPI flow (to watch `broadcasted`, read the fee from the finalized block)
 * encodes exactly what the module does, instead of a copy of it that drifts
 * when the call changes.
 */
import { MemoFormat } from '../../../../protocol/memo/index';
import { accountIdHexToSs58 } from '../../../../foundation/address';
import type {
    ClaimFeesParams,
    PrivateTransferParams,
    ShieldBatchParams,
    ShieldParams,
    UnshieldParams,
} from '../types/params';
import { assertClaimFeesParams, assertMerkleRoots, assertShieldParams } from './validation';

/** `ShieldedPool.shield`'s arguments, by name. */
export function shieldCallArgs(params: ShieldParams, where = 'shield') {
    assertShieldParams(params, where);
    return {
        asset_id: params.assetId,
        amount: params.amount,
        commitment: params.commitment,
        encrypted_memo: params.encryptedMemo,
        proof: params.proof,
        circuit_version: params.circuitVersion,
    };
}

/**
 * `ShieldedPool.shield_batch`'s arguments. Each operation is a tuple in the
 * `shield` call's argument order: the codec reads it positionally, and a named
 * object is mis-encoded.
 */
export function shieldBatchCallArgs(params: ShieldBatchParams) {
    const operations = params.items.map((item, i) => {
        const a = shieldCallArgs(item, `shieldBatch.items[${i}]`);
        return [
            a.asset_id,
            a.amount,
            a.commitment,
            a.encrypted_memo,
            a.proof,
            a.circuit_version,
        ] as const;
    });
    return { operations };
}

/** `ShieldedPool.unshield`'s arguments, by name. A total unshield carries no change. */
export function unshieldCallArgs(params: UnshieldParams) {
    // PAPI's AccountId32 codec takes SS58.
    const recipient = accountIdHexToSs58(params.recipientAddress);
    if (!recipient) throw new Error(`Invalid recipientAddress: ${params.recipientAddress}`);
    const changeMemo = params.changeEncryptedMemo;
    if (changeMemo && changeMemo.length > 0) MemoFormat.validate(changeMemo, 'changeEncryptedMemo');
    return {
        proof: params.proof,
        merkle_root: params.merkleRoot,
        nullifier: params.nullifier,
        asset_id: params.assetId,
        amount: params.amount,
        recipient,
        fee: params.fee ?? 0n,
        change_commitment: params.changeCommitment ?? '0x' + '00'.repeat(32),
        change_encrypted_memo: changeMemo && changeMemo.length > 0 ? changeMemo : new Uint8Array(0),
        circuit_version: params.circuitVersion,
    };
}

/** `ShieldedPool.private_transfer`'s arguments, by name. */
export function privateTransferCallArgs(params: PrivateTransferParams) {
    assertMerkleRoots(params.merkleRoots, 'privateTransfer.merkleRoots');
    return {
        proof: params.proof,
        merkle_roots: params.merkleRoots,
        nullifiers: params.inputs.map((input) => input.nullifier),
        commitments: params.outputs.map((output) => output.commitment),
        encrypted_memos: params.outputs.map((output, i) => {
            MemoFormat.validate(
                output.encryptedMemo,
                `privateTransfer.outputs[${i}].encryptedMemo`
            );
            return output.encryptedMemo;
        }),
        asset_id: params.assetId,
        fee: params.fee ?? 0n,
        circuit_version: params.circuitVersion,
    };
}

/** `ShieldedPool.claim_fees`'s arguments, by name. */
export function claimFeesCallArgs(params: ClaimFeesParams) {
    assertClaimFeesParams(params, 'claimFees');
    return { asset_id: params.assetId, amount: params.amount };
}
