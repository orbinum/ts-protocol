/**
 * A type-2 transaction, hashed, signed with a known key and serialised: the sender
 * recovered from the signature over our hash must be the key's address, and the raw
 * transaction must decode back to the fields and signature that went in. Acceptance
 * by a real node is checked against the dev chain, outside the unit suite.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { describe, expect, it } from 'vitest';
import { fromHex, toHex } from '../../../../src/foundation/encoding/hex';
import { rlpEncode } from '../../../../src/chain/evm/transaction/rlp-encode';
import { eip1559SigningHash } from '../../../../src/chain/evm/transaction/eip1559-signing-hash';
import type { Eip1559Transaction } from '../../../../src/chain/evm/transaction/eip1559-transaction';
import { serializeSignedEip1559 } from '../../../../src/chain/evm/transaction/serialize-signed-eip1559';

// web3.js documentation's example key.
const PRIVATE_KEY = fromHex('0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318');
const ADDRESS = '0x2c7536e3605d9c16a7a3d7b1898e529396a65c23';

const TX: Eip1559Transaction = {
    chainId: 42n,
    nonce: 7n,
    maxPriorityFeePerGas: 1_000_000_000n,
    maxFeePerGas: 3_000_000_000n,
    gas: 21_000n,
    to: '0x6f7262696e756d2f707269766174652d63616c6c',
    value: 10n ** 18n,
    data: '0x',
};

function sign(hash: Uint8Array) {
    const sig = secp256k1.Signature.fromBytes(
        secp256k1.sign(hash, PRIVATE_KEY, { prehash: false, format: 'recovered' }),
        'recovered'
    );
    return { sig, signature: { r: sig.r, s: sig.s, yParity: (sig.recovery ?? 0) as 0 | 1 } };
}

function addressOf(publicKey: Uint8Array): string {
    return toHex(keccak_256(publicKey.slice(1)).slice(-20));
}

/** A minimal RLP decoder, for reading back what the encoder wrote. */
type Item = Uint8Array | Item[];
function decode(bytes: Uint8Array): Item {
    const [item, end] = read(bytes, 0);
    expect(end).toBe(bytes.length);
    return item;
}
function read(b: Uint8Array, at: number): [Item, number] {
    const p = b[at]!;
    if (p < 0x80) return [b.slice(at, at + 1), at + 1];
    const long = (base: number) => {
        const n = p - base;
        let len = 0;
        for (let i = 0; i < n; i++) len = len * 256 + b[at + 1 + i]!;
        return { start: at + 1 + n, len };
    };
    if (p < 0xb8) return [b.slice(at + 1, at + 1 + p - 0x80), at + 1 + p - 0x80];
    if (p < 0xc0) {
        const { start, len } = long(0xb7);
        return [b.slice(start, start + len), start + len];
    }
    const { start, len } = p < 0xf8 ? { start: at + 1, len: p - 0xc0 } : long(0xf7);
    const items: Item[] = [];
    for (let i = start; i < start + len;) {
        const [item, next] = read(b, i);
        items.push(item);
        i = next;
    }
    return [items, start + len];
}
const int = (item: Item) =>
    BigInt(toHex(item as Uint8Array) === '0x' ? 0 : toHex(item as Uint8Array));

describe('eip1559SigningHash + serializeSignedEip1559', () => {
    it('signs a hash the key address recovers from', () => {
        const hash = eip1559SigningHash(TX);
        const { sig } = sign(hash);
        expect(addressOf(sig.recoverPublicKey(hash).toBytes(false))).toBe(ADDRESS);
    });

    it('serialises 0x02 ‖ rlp(fields ‖ yParity ‖ r ‖ s), decoding back to the input', () => {
        const hash = eip1559SigningHash(TX);
        const { signature } = sign(hash);
        const raw = fromHex(serializeSignedEip1559(TX, signature));
        expect(raw[0]).toBe(0x02);
        const fields = decode(raw.slice(1)) as Item[];
        expect(fields).toHaveLength(12);
        expect(fields.slice(0, 5).map(int)).toEqual([
            42n,
            7n,
            1_000_000_000n,
            3_000_000_000n,
            21_000n,
        ]);
        expect(toHex(fields[5] as Uint8Array)).toBe(TX.to);
        expect(int(fields[6]!)).toBe(10n ** 18n);
        expect(toHex(fields[7] as Uint8Array)).toBe('0x');
        expect(fields[8]).toEqual([]);
        expect(int(fields[9]!)).toBe(BigInt(signature.yParity));
        expect(int(fields[10]!)).toBe(signature.r);
        expect(int(fields[11]!)).toBe(signature.s);
        // The hash a node recomputes from the raw payload is the one that was signed.
        const payload = rlpEncode(fields.slice(0, 9));
        expect(toHex(keccak_256(Uint8Array.of(0x02, ...payload)))).toBe(toHex(hash));
    });

    it('changes the hash with the chain id, so a signature cannot be replayed elsewhere', () => {
        expect(toHex(eip1559SigningHash(TX))).not.toBe(
            toHex(eip1559SigningHash({ ...TX, chainId: 2700n }))
        );
    });

    it('deploys with to: null as an empty destination', () => {
        const hash = eip1559SigningHash({ ...TX, to: null, data: '0x6080' });
        const { signature } = sign(hash);
        const fields = decode(
            fromHex(serializeSignedEip1559({ ...TX, to: null, data: '0x6080' }, signature)).slice(1)
        ) as Item[];
        expect(toHex(fields[5] as Uint8Array)).toBe('0x');
        expect(toHex(fields[7] as Uint8Array)).toBe('0x6080');
    });

    it('refuses a high-s signature (EIP-2) and a malformed field, naming it', () => {
        const { signature } = sign(eip1559SigningHash(TX));
        const n = secp256k1.Point.CURVE().n;
        expect(() => serializeSignedEip1559(TX, { ...signature, s: n - signature.s })).toThrow(
            'low-s'
        );
        expect(() => eip1559SigningHash({ ...TX, to: '0x1234' })).toThrow('tx.to');
        expect(() => eip1559SigningHash({ ...TX, data: '0xabc' })).toThrow('tx.data');
    });
});
