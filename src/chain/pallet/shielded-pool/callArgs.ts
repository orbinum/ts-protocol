/**
 * Shielded-pool call arguments in the shape PAPI's metadata-driven API takes.
 *
 * Kept apart from `ShieldedPoolModule` so a host that submits through its own
 * PAPI flow (to watch `broadcasted`, read the fee from the finalized block)
 * encodes exactly what the module does, instead of a copy of it that drifts
 * when the call changes.
 */
import type { ShieldBatchParams, ShieldParams } from './extrinsicParams';
import { assertShieldParams } from './validation';

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
