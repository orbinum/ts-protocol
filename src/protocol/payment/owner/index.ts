/**
 * Owner keys on BabyJubJub: recovering an owner key's point, deriving the
 * stealth owner key a payment to it carries, and deciding whether a note's
 * owner key is a given recipient's.
 */
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { addPoint, Base8, mulPointEscalar } from '@zk-kit/baby-jubjub';
import { BABYJUB_SUBORDER, BN254_R } from '../../../foundation/crypto/constants';
import { bigintTo32Le, bytesToBigintLE } from '../../../foundation/encoding/bytes';

const BJJ_A = 168700n;
const BJJ_D = 168696n;
const STEALTH_INFO = new TextEncoder().encode('orbinum-stealth-v1');

function modpow(base: bigint, exp: bigint, mod: bigint): bigint {
    let result = 1n;
    base %= mod;
    while (exp > 0n) {
        if (exp & 1n) result = (result * base) % mod;
        exp >>= 1n;
        base = (base * base) % mod;
    }
    return result;
}

/** Tonelli-Shanks square root mod r, or null for a non-residue. */
function sqrtModR(y2: bigint): bigint | null {
    if (y2 === 0n) return 0n;
    if (modpow(y2, (BN254_R - 1n) / 2n, BN254_R) !== 1n) return null;
    let s = 0n;
    let q = BN254_R - 1n;
    while ((q & 1n) === 0n) {
        q >>= 1n;
        s++;
    }
    if (s === 1n) return modpow(y2, (BN254_R + 1n) / 4n, BN254_R);
    let z = 2n;
    while (modpow(z, (BN254_R - 1n) / 2n, BN254_R) === 1n) z++;
    let m = s;
    let c = modpow(z, q, BN254_R);
    let t = modpow(y2, q, BN254_R);
    let r = modpow(y2, (q + 1n) / 2n, BN254_R);
    for (;;) {
        if (t === 1n) return r;
        let i = 1n;
        let tmp = (t * t) % BN254_R;
        while (tmp !== 1n) {
            tmp = (tmp * tmp) % BN254_R;
            i++;
        }
        const b = modpow(c, 1n << (m - i - 1n), BN254_R);
        m = i;
        c = (b * b) % BN254_R;
        t = (t * c) % BN254_R;
        r = (r * b) % BN254_R;
    }
}

/**
 * The prime-subgroup point with x coordinate `ax`, or null: zero (the
 * identity, whose stealth key would be public), off the curve, not a field
 * element, or only small-order points (no spending key reaches them).
 */
export function ownerPkPoint(ax: bigint): [bigint, bigint] | null {
    if (typeof ax !== 'bigint' || ax <= 0n || ax >= BN254_R) return null;
    const x2 = (ax * ax) % BN254_R;
    const num = (((1n - BJJ_A * x2) % BN254_R) + BN254_R) % BN254_R;
    const den = (((1n - BJJ_D * x2) % BN254_R) + BN254_R) % BN254_R;
    if (den === 0n) return null;
    const y = sqrtModR((num * modpow(den, BN254_R - 2n, BN254_R)) % BN254_R);
    if (y === null) return null;
    for (const candidate of [y, BN254_R - y]) {
        const point: [bigint, bigint] = [ax, candidate];
        const check = mulPointEscalar(point, BABYJUB_SUBORDER);
        if (check[0] === 0n && check[1] === 1n) return point;
    }
    return null;
}

/** The stealth owner key a payment to `ownerPk` (at `point`) carries, from the memo's shared secret. */
export function stealthOwnerPk(
    sharedSecret: Uint8Array,
    ownerPk: bigint,
    point: [bigint, bigint]
): bigint {
    const bytes = hkdf(sha256, sharedSecret, bigintTo32Le(ownerPk), STEALTH_INFO, 32);
    const scalar = bytesToBigintLE(bytes) % BABYJUB_SUBORDER || 1n;
    return addPoint(mulPointEscalar(Base8, scalar), point)[0];
}

/**
 * Whether a note whose memo names `noteOwnerPk` belongs to `ownerPk`: named
 * directly, or through the stealth address derived from this memo's secret.
 */
export function isOwnedBy(
    noteOwnerPk: bigint,
    ownerPk: bigint,
    point: [bigint, bigint],
    sharedSecret: Uint8Array
): boolean {
    if (noteOwnerPk === ownerPk) return true;
    return stealthOwnerPk(sharedSecret, ownerPk, point) === noteOwnerPk;
}
