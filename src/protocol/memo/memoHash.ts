/**
 * `memo_hash`: the public input that binds a spend's encrypted memos to its
 * proof (transfer / unshield circuit v2).
 *
 * A memo carries a note's secrets but is not otherwise part of the proven
 * statement, so without this anyone who saw a pending spend could swap its memos
 * and leave the notes unrecoverable.
 *
 * The chain recomputes it from the memos it receives
 * (`pallet_shielded_pool::operations::statement::memo_digest`, reduced by
 * `pallet_zk_verifier::encoding`), so it must match byte for byte: blake2_256
 * over the SCALE encoding of the memo list, read little-endian, mod BN254 `r`.
 *
 * Transfer passes its two output memos in order. Unshield passes a list holding
 * its change memo — one empty memo for a total unshield, never an empty list.
 */
import { blake2b } from '@noble/hashes/blake2.js';
import { Bytes, Vector } from '@polkadot-api/substrate-bindings';
import { BN254_R } from '../../foundation/crypto/constants';
import { bytesToBigintLE } from '../../foundation/encoding/bytes';

const memoList = Vector(Bytes());

/** `memo_hash` as a field element, ready to be a circuit input. */
export function memoHash(memos: readonly (Uint8Array | readonly number[])[]): bigint {
    const encoded = memoList.enc(
        memos.map((m) => (m instanceof Uint8Array ? m : Uint8Array.from(m)))
    );
    return bytesToBigintLE(blake2b(encoded, { dkLen: 32 })) % BN254_R;
}
