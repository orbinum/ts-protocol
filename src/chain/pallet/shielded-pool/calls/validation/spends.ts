import { MemoFormat } from '../../../../../protocol/memo/index';
import { TRANSFER_INPUTS, TRANSFER_OUTPUTS } from '../../constants';
import type { PrivateTransferParams, UnshieldParams } from '../../types/params';
import {
    assertHash,
    assertPositiveU128,
    assertProof,
    assertRoot,
    assertU128,
    assertU32,
} from './primitives';

/** `private_transfer`'s `merkle_roots: [Hash; 2]`: one canonical root per input note. */
export function assertMerkleRoots(roots: readonly string[], where: string): void {
    if (!Array.isArray(roots) || roots.length !== TRANSFER_INPUTS) {
        throw new Error(`${where}: expected exactly two merkle roots, one per input`);
    }
    roots.forEach((root, i) => assertRoot(root, `${where}[${i}]`));
}

/**
 * `unshield(proof, merkle_root, nullifier, asset_id: u32, amount: u128,
 * recipient, fee: u128, change_commitment, change_encrypted_memo,
 * circuit_version: u32)`, with a positive amount. The recipient and the change
 * memo are checked where they are encoded.
 */
export function assertUnshieldParams(params: UnshieldParams, where: string): void {
    assertProof(params.proof, `${where}.proof`);
    assertRoot(params.merkleRoot, `${where}.merkleRoot`);
    assertHash(params.nullifier, `${where}.nullifier`);
    assertU32(params.assetId, `${where}.assetId`);
    assertPositiveU128(params.amount, `${where}.amount`);
    assertU128(params.fee ?? 0n, `${where}.fee`);
    if (params.changeCommitment !== undefined) {
        assertHash(params.changeCommitment, `${where}.changeCommitment`);
    }
    assertU32(params.circuitVersion, `${where}.circuitVersion`);
}

/**
 * `private_transfer(proof, merkle_roots: [Hash; 2], nullifiers: [Hash; 2],
 * commitments: [Hash; 2], encrypted_memos, asset_id: u32, fee: u128,
 * circuit_version: u32)`. Every output carries a valid memo: a note without
 * one cannot be found by any scan.
 */
export function assertPrivateTransferParams(params: PrivateTransferParams, where: string): void {
    assertProof(params.proof, `${where}.proof`);
    assertMerkleRoots(params.merkleRoots, `${where}.merkleRoots`);
    if (!Array.isArray(params.inputs) || params.inputs.length !== TRANSFER_INPUTS) {
        throw new Error(`${where}.inputs: expected exactly ${TRANSFER_INPUTS} inputs`);
    }
    params.inputs.forEach((input, i) =>
        assertHash(input.nullifier, `${where}.inputs[${i}].nullifier`)
    );
    if (!Array.isArray(params.outputs) || params.outputs.length !== TRANSFER_OUTPUTS) {
        throw new Error(`${where}.outputs: expected exactly ${TRANSFER_OUTPUTS} outputs`);
    }
    params.outputs.forEach((output, i) => {
        assertHash(output.commitment, `${where}.outputs[${i}].commitment`);
        MemoFormat.validate(output.encryptedMemo, `${where}.outputs[${i}].encryptedMemo`);
    });
    assertU32(params.assetId, `${where}.assetId`);
    assertU128(params.fee ?? 0n, `${where}.fee`);
    assertU32(params.circuitVersion, `${where}.circuitVersion`);
}
