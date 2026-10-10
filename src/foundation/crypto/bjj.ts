import { mulPointEscalar, unpackPoint } from '@zk-kit/baby-jubjub';
import { isInPrimeSubgroup } from './bjj-fast';

/** BabyJubJub's cofactor. `[8]·P` is the identity exactly for the small subgroup. */
const BJJ_COFACTOR = 8n;

/**
 * Unpack a recipient's packed viewing key, refusing keys that would make the
 * ECDH secret guessable.
 *
 * Unpacking alone is not validation. BabyJubJub has a cofactor of 8, so the
 * curve contains a small subgroup, and a point from it has order 1, 2, 4 or 8.
 * `[ephSk]·P` then takes at most 8 values no matter how random `ephSk` is, and
 * an interceptor simply tries them all: a memo sealed toward such a key yields
 * its value, blinding and sourcePk, and a payment slip decrypts, without any
 * secret at all. The all-zero packed value is one of them — an order-4 point.
 *
 * The all-zero byte check that guards privacy addresses does not catch this:
 * the packed value `0` is not the neutral element, it is a legitimate point
 * with y=0 that happens to have order 4. Nor is a low-order key necessarily
 * hostile — it is also what a truncated or half-initialised buffer decodes to.
 * Either way the note is world-readable, so both are refused here.
 *
 * Multiplying by the cofactor is the standard test: `[8]·P` is the identity for
 * every point of the small subgroup and for no other point.
 *
 * A mixed-order point `P + T` (T of small order) still passes. Its secret stays
 * unguessable to outsiders, but `[ephSk]·(P + T)` mixes in `[ephSk mod 8]·T`:
 * the key's owner learns those bits of the sender's ephSk, and eight distinct
 * keys share one prime-order part. This cheap gate suits ephemeral keys
 * (checked per scan hint); a RECIPIENT key must use `unpackSubgroupViewingKey`.
 *
 * @returns the point, or null when it is unusable as a recipient key
 */
export function unpackUsableViewingKey(packed: bigint): [bigint, bigint] | null {
    const point = unpackPoint(packed);
    if (!point) return null;
    // The identity itself: [k]·O = O, so the "secret" is a constant.
    if (point[0] === 0n && point[1] === 1n) return null;
    const cleared = mulPointEscalar(point, BJJ_COFACTOR);
    if (cleared[0] === 0n && cleared[1] === 1n) return null;
    return point;
}

/**
 * Unpack a recipient's viewing key, refusing anything outside the prime-order
 * subgroup: `unpackUsableViewingKey` plus `[N]·P = O`, which also rejects
 * mixed-order points `P + T`. Use it wherever a recipient key enters.
 *
 * @returns the point, or null when it is not a prime-subgroup recipient key
 */
export function unpackSubgroupViewingKey(packed: bigint): [bigint, bigint] | null {
    const point = unpackUsableViewingKey(packed);
    if (!point || !isInPrimeSubgroup(point)) return null;
    return point;
}
