/**
 * Shielded-pool call arguments in the shape PAPI's metadata-driven API takes.
 *
 * Kept apart from `ShieldedPoolModule` so a host that signs a shield through
 * its own PAPI flow (to watch `broadcasted`, read the fee from the finalized
 * block) encodes exactly what the module does: `shieldCallArgs` and
 * `shieldBatchCallArgs` are public for that. The spend arguments stay internal
 * — the module submits spends unsigned, and a host has no other way to.
 */
import { MemoFormat } from '../../../../protocol/memo/memoFormat';
import { boundActionArg } from '../../../../protocol/bound/index';
import { accountIdHexToSs58 } from '../../../../foundation/address';
import { toHex } from '../../../../foundation/encoding/hex';
import type {
    BoundSpendParams,
    ClaimFeesParams,
    PrivateTransferParams,
    ShieldBatchParams,
    ShieldParams,
    UnshieldParams,
} from '../types/params';
import {
    assertBoundSpendParams,
    assertClaimFeesParams,
    assertPrivateTransferParams,
    assertShieldParams,
    assertUnshieldParams,
} from './validation/index';

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

/** Bytes as lowercase 0x hex, from hex, bytes or PAPI's `Binary`; null otherwise. */
function hexOf(v: unknown): string | null {
    if (typeof v === 'string') return /^0x[0-9a-fA-F]*$/.test(v) ? v.toLowerCase() : null;
    if (v instanceof Uint8Array) return toHex(v);
    if (Array.isArray(v) && v.every((b) => Number.isInteger(b))) return toHex(v as number[]);
    const asHex = (v as { asHex?: () => string } | null)?.asHex;
    return typeof asHex === 'function' ? hexOf(asHex.call(v)) : null;
}

/**
 * One `shield_batch` operation read back — PAPI's decoded tuple or its JSON — in the
 * runtime's order `(asset_id, amount, commitment, encrypted_memo, proof,
 * circuit_version)`, or null when it does not have that shape.
 */
export function decodeShieldBatchOperation(op: unknown): {
    assetId: number;
    amount: bigint;
    commitment: string;
    circuitVersion: number;
} | null {
    if (!Array.isArray(op) || op.length !== 6) return null;
    const [assetId, amount, commitment, , , circuitVersion] = op as unknown[];
    const hex = hexOf(commitment);
    const asset = Number(assetId);
    const version = Number(circuitVersion);
    if (!hex || !Number.isInteger(asset) || !Number.isInteger(version)) return null;
    let value: bigint;
    try {
        value = BigInt(amount as bigint | number | string);
    } catch {
        return null;
    }
    return { assetId: asset, amount: value, commitment: hex, circuitVersion: version };
}

/** `ShieldedPool.unshield`'s arguments, by name. A total unshield carries no change. */
export function unshieldCallArgs(params: UnshieldParams) {
    assertUnshieldParams(params, 'unshield');
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

/**
 * `ShieldedPool.bound_spend`'s arguments, by name. No recipient: the runtime pays the
 * action's executor, which the proof must name.
 */
export function boundSpendCallArgs(params: BoundSpendParams) {
    assertBoundSpendParams(params, 'boundSpend');
    const changeMemo = params.changeEncryptedMemo;
    if (changeMemo && changeMemo.length > 0) MemoFormat.validate(changeMemo, 'changeEncryptedMemo');
    return {
        proof: params.proof,
        merkle_root: params.merkleRoot,
        nullifier: params.nullifier,
        asset_id: params.assetId,
        amount: params.amount,
        fee: params.fee ?? 0n,
        change_commitment: params.changeCommitment ?? '0x' + '00'.repeat(32),
        change_encrypted_memo: changeMemo && changeMemo.length > 0 ? changeMemo : new Uint8Array(0),
        circuit_version: params.circuitVersion,
        action: boundActionArg(params.action),
    };
}

/** `ShieldedPool.private_transfer`'s arguments, by name. */
export function privateTransferCallArgs(params: PrivateTransferParams) {
    assertPrivateTransferParams(params, 'privateTransfer');
    return {
        proof: params.proof,
        merkle_roots: params.merkleRoots,
        nullifiers: params.inputs.map((input) => input.nullifier),
        commitments: params.outputs.map((output) => output.commitment),
        encrypted_memos: params.outputs.map((output) => output.encryptedMemo),
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
