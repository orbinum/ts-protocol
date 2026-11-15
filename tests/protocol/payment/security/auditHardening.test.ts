/**
 * Defences added after the 0.15.0 audit, each as the attack it stops:
 *
 * - one payment, many orders: a slip resealed with its commitment in another
 *   letter case must verify to the SAME `commitmentHex` string;
 * - a slip verifier as an oracle: `verifyPayment` refusals carry no payment, so
 *   whoever submits slips (built from public chain data) learns nothing about
 *   the recipient's notes;
 * - leaking the viewing key mod 8: mixed-order ephemeral keys are refused;
 * - garbage that throws: the public decoders answer null for non-strings;
 * - the per-key caches never answer one key for another.
 */
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { Base8, addPoint, mulPointEscalar, packPoint, unpackPoint } from '@zk-kit/baby-jubjub';
import { describe, expect, it } from 'vitest';
import {
    BN254_R,
    bigintTo32Le,
    bytesToBigintLE,
    decodePaymentSlip,
    encodePaymentSlip,
    fromHex,
    openPaymentSlip,
    sealPaymentSlip,
} from '../../../../src';
import {
    checkPaymentProof,
    readPaymentSlip,
    verifyPayment,
} from '../../../../src/protocol/payment';
import { bytesToBjjScalar } from '../../../../src/protocol/memo/memoFormat';
import { memoSharedSecret } from '../../../../src/protocol/payment/memo';
import { ownerPkPoint } from '../../../../src/protocol/payment/owner';
import { handle } from '../../../../wasm/handle';
import { ADDRESS, KEY, OTHER_ADDRESS, RECIPIENT_IVK, proofVector, vector } from '../vectors';

const finalTree = {
    getFinalizedLeafIndex: async () => 3,
    getMerkleProofByCommitment: async () => ({ leafIndex: 3 }),
};
const SLIP_DOMAIN = new TextEncoder().encode('orbinum-payment-slip-v1');
const anonymous = vector('anonymous');
const expected = { value: BigInt(anonymous.expected!.value), assetId: 0n };
const fields = () => openPaymentSlip(KEY.viewingSecretKey, decodePaymentSlip(anonymous.slip)!)!;
/** `point` plus the order-2 point (0, -1): same prime-order part, mixed order. */
const mixed = (packed: bigint): bigint => {
    const point = unpackPoint(packed)!;
    return packPoint(addPoint(point, [0n, BN254_R - 1n]));
};

describe('Threat: one payment settles many orders under other letter cases', () => {
    it('a slip resealed with an uppercase commitment verifies to the same lowercase string', async () => {
        const original = fields();
        const upper = '0x' + original.commitmentHex.slice(2).toUpperCase();
        const resealed = encodePaymentSlip(
            sealPaymentSlip(RECIPIENT_IVK, { ...original, commitmentHex: upper })
        );
        const a = await verifyPayment(anonymous.slip, { key: KEY, tree: finalTree, expected });
        const b = await verifyPayment(resealed, { key: KEY, tree: finalTree, expected });
        if (!a.ok || !b.ok) throw new Error('both must verify');
        expect(b.payment.commitmentHex).toBe(a.payment.commitmentHex);
        expect(b.payment.commitmentHex).toBe(b.payment.commitmentHex.toLowerCase());
        expect(readPaymentSlip(resealed, KEY)!.commitmentHex).toBe(a.payment.commitmentHex);
    });
});

describe('Threat: a slip verifier decrypts the recipient’s notes for whoever asks', () => {
    const missing = {
        getFinalizedLeafIndex: async () => null,
        getMerkleProofByCommitment: async () => {
            throw new Error('Commitment not found in tree');
        },
    };
    const notFinal = { ...finalTree, getFinalizedLeafIndex: async () => null };
    it.each([
        ['wrong-amount', finalTree, { ...expected, value: expected.value + 1n }],
        ['wrong-asset', finalTree, { ...expected, assetId: 7n }],
        ['not-on-chain', missing, expected],
        ['not-final', notFinal, expected],
    ])('a %s refusal carries no payment', async (reason, tree, want) => {
        const result = await verifyPayment(anonymous.slip, { key: KEY, tree, expected: want });
        expect(result).toEqual({ ok: false, reason });
    });
});

describe('Threat: mixed-order ephemeral keys leak the viewing key mod 8', () => {
    it('a memo whose ephemeral key is P + T opens no shared secret', () => {
        const memo = fromHex(fields().encryptedMemo);
        expect(memoSharedSecret(memo, KEY.viewingSecretKey)).not.toBeNull();
        const at = memo.length - 32;
        const forged = memo.slice();
        forged.set(bigintTo32Le(mixed(bytesToBigintLE(memo.subarray(at)))), at);
        expect(memoSharedSecret(forged, KEY.viewingSecretKey)).toBeNull();
    });

    it('a slip sealed under a P + T ephemeral key does not open', () => {
        // Sealed the way an attacker probing s mod 8 would: under [s](P + T),
        // one of the candidate secrets. The recipient must refuse the key itself.
        const ephPk = mixed(packPoint(mulPointEscalar(Base8, 12345n)));
        const shared = mulPointEscalar(unpackPoint(ephPk)!, bytesToBjjScalar(KEY.viewingSecretKey));
        const key = hkdf(sha256, bigintTo32Le(shared[0]), undefined, SLIP_DOMAIN, 32);
        const suffix = new Uint8Array(8).fill(9);
        const nonce = new Uint8Array([...new TextEncoder().encode('SLP1'), ...suffix]);
        const sealed = chacha20poly1305(key, nonce).encrypt(
            new TextEncoder().encode(JSON.stringify(fields()))
        );
        const envelope = new Uint8Array([...bigintTo32Le(ephPk), ...suffix, ...sealed]);
        expect(openPaymentSlip(KEY.viewingSecretKey, envelope)).toBeNull();
        expect(readPaymentSlip(encodePaymentSlip(envelope), KEY)).toBeNull();
    });
});

describe('Threat: non-string input throws out of a public decoder', () => {
    it.each([undefined, null, 42, {}, ['orbslip1:']])('decodePaymentSlip(%p) is null', (input) => {
        expect(decodePaymentSlip(input as unknown as string)).toBeNull();
    });
    it('openPaymentSlip with non-bytes is null', () => {
        expect(openPaymentSlip(null as never, null as never)).toBeNull();
        expect(openPaymentSlip(KEY.viewingSecretKey, 'x'.repeat(100) as never)).toBeNull();
    });
});

describe('the per-key caches', () => {
    it('never answer one address for another', () => {
        const proof = proofVector('anonymous').proof;
        const want = { value: 1500n, assetId: 0n };
        for (let i = 0; i < 2; i++) {
            expect(checkPaymentProof(proof, { address: ADDRESS, expected: want }).ok).toBe(true);
            expect(checkPaymentProof(proof, { address: OTHER_ADDRESS, expected: want }).ok).toBe(
                false
            );
        }
    });

    it('hand out a fresh point each time, so a caller cannot poison them', () => {
        const a = ownerPkPoint(KEY.ownerPk)!;
        a[1] = 1n;
        expect(ownerPkPoint(KEY.ownerPk)![1]).not.toBe(1n);
    });
});

describe('the WASI handler', () => {
    it('requires assetId: no silent native default', () => {
        const { proof } = proofVector('anonymous');
        expect(handle({ proof, address: ADDRESS, value: '1500' })).toHaveProperty('error');
        expect(handle({ proof, address: ADDRESS, value: '1500', assetId: '0' })).toHaveProperty(
            'ok',
            true
        );
    });
});
