/**
 * Security guarantees of proof verification (`orbproof1:`, public address
 * only), one test per property, grouped by the threat each answers. A change
 * that weakens a defence fails the test named after it.
 *
 * The property everything rests on: a proof is accepted only for a note the
 * recipient's WALLET opens the same way, so what the server confirms is money
 * the recipient can spend.
 */
import { describe, expect, it } from 'vitest';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { fromHex, toHex } from '../../../../src';
import {
    checkPaymentProof,
    decodePaymentProof,
    encodePaymentProof,
    verifyPaymentProof,
    type NoteTreeLookup,
    type PaymentProof,
} from '../../../../src/protocol/payment';
import { decodePaymentAddress } from '../../../../src/protocol/payment/address';
import { memoSharedSecret, proofSharedSecret } from '../../../../src/protocol/payment/memo';
import { ADDRESS, ADDRESS_IVSK, OTHER_ADDRESS, PROOF_VECTORS, proofVector } from '../vectors';

const fieldsOf = (name: string) => decodePaymentProof(proofVector(name).proof)!;
const encode = (p: PaymentProof) => encodePaymentProof(p);
const expected = { value: 1500n, assetId: 0n };
const check = (proof: string, address = ADDRESS) => checkPaymentProof(proof, { address, expected });
const refused = { ok: false, reason: 'invalid-proof' };
const counting = (): NoteTreeLookup & { calls: string[] } => {
    const calls: string[] = [];
    return {
        calls,
        getFinalizedLeafIndex: async (hex) => (calls.push(hex), 1),
        getMerkleProofByCommitment: async (hex) => (calls.push(hex), { leafIndex: 1 }),
    };
};
/** Replace `length` bytes of a hex field at `offset`. */
const splice = (hex: string, offset: number, bytes: Uint8Array) => {
    const b = fromHex(hex);
    b.set(bytes, offset);
    return toHex(b);
};

describe('Property: the server reaches the secret the recipient’s wallet reaches', () => {
    it('for every vector, [ephSk]·ivk equals the wallet’s [ivsk]·ephPk', () => {
        const { viewingKey } = decodePaymentAddress(ADDRESS)!;
        for (const v of PROOF_VECTORS.filter((c) => c.name !== 'other-recipient')) {
            const p = decodePaymentProof(v.proof)!;
            const memo = fromHex(p.encryptedMemo);
            const server = proofSharedSecret(memo, fromHex(p.ephemeralSecretKey), viewingKey);
            expect(server, v.name).toEqual(memoSharedSecret(memo, ADDRESS_IVSK));
        }
    });
});

describe('Threat: a payer proves a payment the recipient cannot spend', () => {
    it('a memo whose ephemeral key is not [ephSk]·B is refused (the wallet could not open it)', () => {
        // The memo still decrypts under the proof's secret; only the ephemeral
        // key the wallet reads is swapped. Accepting it would confirm a note
        // the recipient's wallet derives a different secret for.
        const p = fieldsOf('anonymous');
        const otherEph = fromHex(fieldsOf('pseudonym').encryptedMemo).subarray(148);
        expect(
            check(encode({ ...p, encryptedMemo: splice(p.encryptedMemo, 148, otherEph) }))
        ).toEqual(refused);
    });

    it('a memo the recipient’s scanner would skip (wrong view tag) is refused', () => {
        // Re-sealed under the right key with a nonce whose first byte is not
        // the view tag: it opens, but a wallet scanning the chain never tries it.
        const p = fieldsOf('anonymous');
        const memo = fromHex(p.encryptedMemo);
        const { viewingKey } = decodePaymentAddress(ADDRESS)!;
        const ss = proofSharedSecret(memo, fromHex(p.ephemeralSecretKey), viewingKey)!;
        const key = sha256(
            new Uint8Array([
                ...ss,
                ...fromHex(p.commitmentHex),
                ...new TextEncoder().encode('orbinum-note-encryption-v1'),
            ])
        );
        const plaintext = chacha20poly1305(key, memo.subarray(0, 12)).decrypt(
            memo.subarray(12, 148)
        );
        const nonce = memo.slice(0, 12);
        nonce[0]! ^= 0xff;
        const resealed = new Uint8Array([
            ...nonce,
            ...chacha20poly1305(key, nonce).encrypt(plaintext),
            ...memo.subarray(148),
        ]);
        expect(check(encode({ ...p, encryptedMemo: toHex(resealed) }))).toEqual(refused);
    });

    it('a different ephemeral secret key is refused', () => {
        const p = fieldsOf('anonymous');
        expect(
            check(encode({ ...p, ephemeralSecretKey: fieldsOf('direct').ephemeralSecretKey }))
        ).toEqual(refused);
        const flipped = fromHex(p.ephemeralSecretKey);
        flipped[31]! ^= 1;
        expect(check(encode({ ...p, ephemeralSecretKey: toHex(flipped) }))).toEqual(refused);
    });

    it('a sender named by address is refused: only the viewing key proves that claim', () => {
        expect(
            checkPaymentProof(proofVector('address-claim').proof, {
                address: ADDRESS,
                expected: { value: 3500n, assetId: 0n },
            })
        ).toEqual(refused);
    });
});

describe('Threat: a payer proves a payment never made, or made to someone else', () => {
    it('another note’s commitment around this memo is refused', () => {
        const p = fieldsOf('anonymous');
        expect(check(encode({ ...p, commitmentHex: fieldsOf('pseudonym').commitmentHex }))).toEqual(
            refused
        );
    });

    it('a tampered memo is refused', () => {
        const p = fieldsOf('anonymous');
        const memo = fromHex(p.encryptedMemo);
        memo[40]! ^= 1;
        expect(check(encode({ ...p, encryptedMemo: toHex(memo) }))).toEqual(refused);
    });

    it('a payment to another address is refused, and a valid proof fails against another address', () => {
        expect(
            checkPaymentProof(proofVector('other-recipient').proof, { address: ADDRESS, expected })
        ).toEqual(refused);
        expect(check(proofVector('anonymous').proof, OTHER_ADDRESS)).toEqual(refused);
    });

    it('a consistent proof for a note that never landed is not-on-chain, never ok', async () => {
        const result = await verifyPaymentProof(proofVector('anonymous').proof, {
            address: ADDRESS,
            expected,
            tree: {
                getFinalizedLeafIndex: async () => null,
                getMerkleProofByCommitment: async () => {
                    throw new Error('No merkle leaf for commitment');
                },
            },
        });
        expect(result.ok).toBe(false);
        expect(result).toMatchObject({ reason: 'not-on-chain' });
    });
});

describe('Threat: hostile input that crashes the verifier', () => {
    it('never throws on garbage, whatever its shape', () => {
        const p = fieldsOf('anonymous');
        const body = proofVector('anonymous').proof;
        for (const bad of [
            '',
            'orbproof1:',
            body.replace(/:[0-9a-f]{8}$/, ':00000000'),
            encode({ ...p, encryptedMemo: '0x' + 'ff'.repeat(180) }),
            encode({ ...p, ephemeralSecretKey: '0x' + '00'.repeat(32) }),
            encode({ ...p, commitmentHex: '0x' + 'ff'.repeat(32) }),
            '\u0000'.repeat(500),
            `${body}${'x'.repeat(5_000_000)}`,
            undefined,
            null,
            12,
            {},
        ]) {
            expect(check(bad as never)).toEqual(refused);
        }
    });
});

describe('Threat: a miswired server answers every customer "not paid"', () => {
    it('an invalid address or expectation throws TypeError and never queries the node', async () => {
        const tree = counting();
        const proof = proofVector('anonymous').proof;
        for (const address of ['', 'orbpriv3:nope', ADDRESS.slice(0, -1) + 'z']) {
            await expect(verifyPaymentProof(proof, { address, tree, expected })).rejects.toThrow(
                TypeError
            );
        }
        for (const bad of [
            { value: 0n, assetId: 0n },
            { value: 1500, assetId: 0n },
            { value: 1500n, assetId: 2n ** 32n },
        ]) {
            await expect(
                verifyPaymentProof(proof, { address: ADDRESS, tree, expected: bad as never })
            ).rejects.toThrow(TypeError);
        }
        expect(tree.calls).toEqual([]);
    });
});

describe('Threat: a proof makes the server query the node about arbitrary commitments', () => {
    it('the node is asked only about a consistent proof of the expected amount', async () => {
        const tree = counting();
        const p = fieldsOf('anonymous');
        await verifyPaymentProof(
            encode({ ...p, commitmentHex: fieldsOf('direct').commitmentHex }),
            {
                address: ADDRESS,
                tree,
                expected,
            }
        );
        await verifyPaymentProof(encode(p), {
            address: ADDRESS,
            tree,
            expected: { value: 1n, assetId: 0n },
        });
        expect(tree.calls).toEqual([]);
        await verifyPaymentProof(encode(p), { address: ADDRESS, tree, expected });
        expect(tree.calls).toEqual([p.commitmentHex]);
    });
});

describe('Threat: an unreliable node decides an order', () => {
    it('a node that cannot answer throws (retry), never “not paid”', async () => {
        for (const message of ['merkle proof queue is full', 'Request timeout', 'Internal error']) {
            const tree: NoteTreeLookup = {
                getFinalizedLeafIndex: async () => null,
                getMerkleProofByCommitment: async () => {
                    throw new Error(message);
                },
            };
            await expect(
                verifyPaymentProof(proofVector('anonymous').proof, {
                    address: ADDRESS,
                    tree,
                    expected,
                }),
                message
            ).rejects.toThrow(message);
        }
    });

    it('a nonsense answer throws instead of confirming', async () => {
        for (const answer of [{}, { leafIndex: -1 }, { leafIndex: 0.5 }, null]) {
            const tree = {
                getFinalizedLeafIndex: async () => null,
                getMerkleProofByCommitment: async () => answer,
            } as unknown as NoteTreeLookup;
            await expect(
                verifyPaymentProof(proofVector('anonymous').proof, {
                    address: ADDRESS,
                    tree,
                    expected,
                })
            ).rejects.toThrow(/invalid leaf index/);
        }
    });
});

describe('Threat: one payment settles two orders', () => {
    it('every spelling of a proof yields the same commitmentHex to store', () => {
        // A proof re-typed in uppercase, with a checksum that matches it.
        const body = proofVector('anonymous').proof.replace(/:[0-9a-f]{8}$/, '');
        const [scheme, commitment, ...rest] = body.split(':');
        const shouty = `${scheme}:0x${commitment!.slice(2).toUpperCase()}:${rest.join(':')}`;
        const checksum = toHex(sha256(new TextEncoder().encode(shouty)).slice(0, 4)).slice(2);
        const a = check(proofVector('anonymous').proof);
        const b = check(`${shouty}:${checksum}`);
        expect(b.ok).toBe(true);
        expect(a.ok && b.ok && a.payment.commitmentHex === b.payment.commitmentHex).toBe(true);
    });
});
