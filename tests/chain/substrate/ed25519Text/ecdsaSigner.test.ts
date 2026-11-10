/**
 * EVM accounts sign the same text with `personal_sign` (EIP-191): the runtime's own
 * signature (RFC 6979, Alith's key) is reproduced byte for byte, and only a canonical
 * signature from the expected address is tagged and sent.
 */
import { describe, it, expect, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { concatBytes } from '@noble/hashes/utils.js';
import { fromHex, toHex } from '../../../../src/foundation/encoding/hex';
import {
    eip191Message,
    TAG_ECDSA_TEXT,
    textMessage,
} from '../../../../src/chain/substrate/ed25519Text/message';
import {
    ecdsaTextSignPayload,
    recoverEip191,
} from '../../../../src/chain/substrate/ed25519Text/ecdsaSigner';
import { Ed25519TextSignatureError } from '../../../../src/chain/substrate/ed25519Text/signer';
import { GENESIS, SHORT_PAYLOAD, VECTORS, nameOf, pjs, remark, remarkSummary } from './fixtures';

const callNameFrom = vi.hoisted(() => vi.fn());
vi.mock('../../../../src/chain/substrate/ed25519Text/callName', () => ({ callNameFrom }));
callNameFrom.mockImplementation((_metadata: string, call: Uint8Array) => nameOf(call));

const ECDSA = VECTORS.ecdsa.find((v) => v.name === 'transfer')!;
const utf8 = (s: string) => new TextEncoder().encode(s);

/** `personal_sign` as an EVM wallet returns it: `r ‖ s ‖ v` with `v` 27/28. */
const personalSign = (key: string) => async (message: Uint8Array) => {
    const sig = secp256k1.sign(keccak_256(eip191Message(message)), fromHex(key), {
        prehash: false,
        format: 'recovered',
    });
    return toHex(concatBytes(sig.slice(1), Uint8Array.of(sig[0]! + 27)));
};

describe('EcdsaText against the runtime', () => {
    it.each(VECTORS.ecdsa)(
        '$name: frames the shared text as the runtime does and reproduces its signature',
        async (v) => {
            const vector = VECTORS.vectors.find((t) => t.payload === v.payload)!;
            const text = utf8(vector.text);
            expect(toHex(eip191Message(text))).toBe(v.message);
            const signature = fromHex(await personalSign(v.privateKey)(text));
            expect(toHex(recoverEip191(signature, text, v.address)!)).toBe(v.signature);
        }
    );

    it('prefixes the UTF-8 byte length, not the character count', () => {
        const v = VECTORS.ecdsa.find((e) => e.name === 'shield_multibyte')!;
        const text = VECTORS.vectors.find((t) => t.payload === v.payload)!.text;
        expect(text).toContain('…');
        const bytes = utf8(text).length;
        expect(bytes).toBeGreaterThan(text.length);
        const prefix = toHex(utf8(`\x19Ethereum Signed Message:\n${bytes}`));
        expect(v.message.startsWith(prefix)).toBe(true);
    });
});

describe('recoverEip191', () => {
    const text = utf8('Orbinum transaction');
    it('normalises v to the raw recovery id', async () => {
        const sig = fromHex(await personalSign(ECDSA.privateKey)(text));
        expect(sig[64]).toBeGreaterThanOrEqual(27);
        expect(recoverEip191(sig, text, ECDSA.address)![64]).toBeLessThan(2);
    });

    it('refuses another address, other bytes and a high s', async () => {
        const sig = fromHex(await personalSign(ECDSA.privateKey)(text));
        expect(recoverEip191(sig, text, '0x' + '11'.repeat(20))).toBeNull();
        expect(recoverEip191(sig, utf8('other'), ECDSA.address)).toBeNull();
        const n = secp256k1.Point.CURVE().n;
        const s = BigInt(toHex(sig.slice(32, 64)));
        const high = fromHex('0x' + (n - s).toString(16).padStart(64, '0'));
        const flipped = concatBytes(sig.slice(0, 32), high, Uint8Array.of(sig[64]! ^ 1));
        expect(recoverEip191(flipped, text, ECDSA.address)).toBeNull();
        expect(recoverEip191(sig.slice(0, 64), text, ECDSA.address)).toBeNull();
    });
});

describe('ecdsaTextSignPayload', () => {
    it('signs the transaction text and tags it EcdsaText', async () => {
        const sign = vi.fn(personalSign(ECDSA.privateKey));
        const { signature } = await ecdsaTextSignPayload(
            '0x',
            ECDSA.address,
            sign
        )(pjs(remark('orbinum solana probe')));
        const bytes = fromHex(signature);
        expect(bytes[0]).toBe(TAG_ECDSA_TEXT);
        expect(bytes.length).toBe(66);
        expect(sign).toHaveBeenCalledWith(
            textMessage(
                fromHex(SHORT_PAYLOAD),
                fromHex(GENESIS),
                remarkSummary('orbinum solana probe')
            )
        );
    });

    it('shows the payload’s nonce in the signed text', async () => {
        const sign = vi.fn(personalSign(ECDSA.privateKey));
        await ecdsaTextSignPayload(
            '0x',
            ECDSA.address,
            sign
        )({
            ...pjs(remark('a')),
            nonce: '0x00000005',
        });
        expect(new TextDecoder().decode(sign.mock.calls[0]![0])).toMatch(
            /\nexpires: never\nnonce: 5\npayload: /
        );
    });

    it('sends nothing when another account signed', async () => {
        const other = '0x' + '42'.repeat(32);
        await expect(
            ecdsaTextSignPayload('0x', ECDSA.address, personalSign(other))(pjs(remark('a')))
        ).rejects.toThrow(Ed25519TextSignatureError);
    });

    it('never asks the wallet to sign a call that is not text-signable', async () => {
        const sign = vi.fn(personalSign(ECDSA.privateKey));
        const burn = VECTORS.vectors.find((v) => v.name === 'balances_burn')!;
        await expect(
            ecdsaTextSignPayload('0x', ECDSA.address, sign)(pjs(burn.call))
        ).rejects.toThrow(/cannot be signed as text/);
        expect(sign).not.toHaveBeenCalled();
    });

    it('refuses an address that is not 0x-prefixed', () => {
        expect(recoverEip191(new Uint8Array(65), utf8('x'), ECDSA.address.slice(2))).toBeNull();
    });
});
