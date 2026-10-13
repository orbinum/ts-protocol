import { MemoFormat } from '../../../../../protocol/memo/index';
import type { ShieldParams } from '../../types/params';
import { assertHash, assertPositiveU128, assertProof, assertU32 } from './primitives';

/**
 * `shield(asset_id: u32, amount: u128, commitment: [u8; 32], encrypted_memo,
 * proof, circuit_version: u32)`, with a positive amount, a valid memo and a proof.
 */
export function assertShieldParams(params: ShieldParams, where: string): void {
    assertU32(params.assetId, `${where}.assetId`);
    assertPositiveU128(params.amount, `${where}.amount`);
    assertHash(params.commitment, `${where}.commitment`);
    MemoFormat.validate(params.encryptedMemo, `${where}.encryptedMemo`);
    assertProof(params.proof, `${where}.proof`);
    assertU32(params.circuitVersion, `${where}.circuitVersion`);
}
