/**
 * A bound spend's `memo_hash`: its proof commits to an action as well as its change
 * memo, so it is valid for that action alone — a copier can neither swap the action (or
 * the note it mints) nor replay the proof as a plain unshield, which hashes the memo alone.
 *
 * The chain recomputes it (`pallet_shielded_pool::operations::statement::bound_digest`):
 *
 *   blake2_256("orbinum:bound-spend:v1" ‖ genesis_hash ‖ blake2_256(SCALE(action)) ‖ memo_digest([change_memo]))
 *
 * read little-endian, mod BN254 `r`.
 */
import { blake2b } from '@noble/hashes/blake2.js';
import { Bytes, Vector } from '@polkadot-api/substrate-bindings';
import { BN254_R } from '../../../foundation/crypto/constants';
import { bytesToBigintLE } from '../../../foundation/encoding/bytes';
import { fromHex } from '../../../foundation/encoding/hex';
import { encodeBoundAction, type BoundAction } from '../action/index';

/** Domain of a bound spend's `memo_hash`. */
export const BOUND_SPEND_DOMAIN = 'orbinum:bound-spend:v1';

const memoList = Vector(Bytes());

/**
 * `memo_hash` of a bound spend, as a field element ready to be a circuit input.
 * `changeMemo` is the change note's memo exactly as submitted (empty for none).
 */
export function boundSpendDigest(
    genesisHash: string | Uint8Array,
    action: BoundAction,
    changeMemo: Uint8Array | readonly number[]
): bigint {
    const genesis = typeof genesisHash === 'string' ? fromHex(genesisHash) : genesisHash;
    if (genesis.length !== 32) throw new Error('boundSpendDigest: genesis hash must be 32 bytes');
    const memo = changeMemo instanceof Uint8Array ? changeMemo : Uint8Array.from(changeMemo);
    const domain = new TextEncoder().encode(BOUND_SPEND_DOMAIN);
    const preimage = new Uint8Array(domain.length + 96);
    preimage.set(domain, 0);
    preimage.set(genesis, domain.length);
    preimage.set(blake2b(encodeBoundAction(action), { dkLen: 32 }), domain.length + 32);
    preimage.set(blake2b(memoList.enc([memo]), { dkLen: 32 }), domain.length + 64);
    return bytesToBigintLE(blake2b(preimage, { dkLen: 32 })) % BN254_R;
}
