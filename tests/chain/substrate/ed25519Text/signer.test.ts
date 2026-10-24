/**
 * The pjs `signPayload` of an ed25519 account: it signs the text with call names from the
 * transaction's metadata, checks the signature locally, and tags it by the form signed.
 */
import { describe, it, expect, vi } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { fromHex, toHex } from '../../../../src/foundation/encoding/hex';
import {
    TAG_ED25519_TEXT,
    TAG_ED25519_WRAPPED_TEXT,
    textMessage,
    wrapBytes,
} from '../../../../src/chain/substrate/ed25519Text/message';
import { signingPayload } from '../../../../src/chain/substrate/ed25519Text/payload';
import {
    Ed25519TextSignatureError,
    textSignPayload,
} from '../../../../src/chain/substrate/ed25519Text/signer';
import { GENESIS, SHORT_PAYLOAD, nameOf, pjs, remark } from './fixtures';

const callNameFrom = vi.hoisted(() => vi.fn());
vi.mock('../../../../src/chain/substrate/ed25519Text/callName', () => ({ callNameFrom }));
callNameFrom.mockImplementation((_metadata: string, call: Uint8Array) => nameOf(call));

/** A Phantom signature over the first, hash-only text of `SHORT_PAYLOAD`. */
const PHANTOM = {
    key: '0x64c602b56868980acc7d978f3e6564079b9d1323b3578660986d9561cbf39ff5',
    short:
        '0xec3a49751ef729e15d8cd227a49f696799c0b763d6601d0fd19cc3246010f2ac' +
        '07405822f2b7cefb999f5d3d15e1bd8dd18c7c7da980d07852d8f8d4fb0f0b04',
};

const METADATA = '0x6d657461';
const secret = (n: number) => new Uint8Array(32).fill(n);
const publicOf = (n: number) => ed25519.getPublicKey(secret(n));
/** A signer with key `n`, over `transform(message)`: `wrapBytes` is what signRaw does. */
const signWith =
    (n: number, transform: (m: Uint8Array) => Uint8Array = wrapBytes) =>
    async (message: Uint8Array) =>
        ed25519.sign(transform(message), secret(n));

describe('textSignPayload', () => {
    it('signs the text and tags a <Bytes> signature Ed25519WrappedText', async () => {
        const sign = vi.fn(signWith(9));
        const { signature } = await textSignPayload(
            METADATA,
            publicOf(9),
            sign
        )(pjs(remark('orbinum solana probe')));
        const bytes = fromHex(signature);
        expect(bytes[0]).toBe(TAG_ED25519_WRAPPED_TEXT);
        expect(bytes.length).toBe(65);
        expect(sign).toHaveBeenCalledWith(
            textMessage(fromHex(SHORT_PAYLOAD), fromHex(GENESIS), 'System.remark')
        );
    });

    it('tags a signature over the bare text Ed25519Text', async () => {
        const { signature } = await textSignPayload(
            METADATA,
            publicOf(5),
            signWith(5, (m) => m)
        )(pjs(remark('a')));
        expect(fromHex(signature)[0]).toBe(TAG_ED25519_TEXT);
    });

    it('names the call from the transaction’s metadata', async () => {
        callNameFrom.mockClear();
        await textSignPayload(METADATA, publicOf(4), signWith(4))(pjs(remark('a')));
        expect(callNameFrom).toHaveBeenCalledWith(METADATA, fromHex(remark('a')));
    });

    it('renders a non-zero tip into the signed text', async () => {
        const sign = vi.fn(signWith(4));
        const tip = '0x' + (10n ** 16n).toString(16).padStart(32, '0');
        await textSignPayload(METADATA, publicOf(4), sign)({ ...pjs(remark('a')), tip });
        expect(new TextDecoder().decode(sign.mock.calls[0]![0])).toContain(
            '\naction: System.remark\ntip: 0.01 ORB\n'
        );
    });

    it('refuses a signature by another key', async () => {
        await expect(
            textSignPayload(METADATA, publicOf(2), signWith(1))(pjs(remark('a')))
        ).rejects.toBeInstanceOf(Ed25519TextSignatureError);
    });

    it('refuses a raw signature over the payload bytes', async () => {
        const raw = async () => ed25519.sign(fromHex(SHORT_PAYLOAD), secret(3));
        await expect(
            textSignPayload(METADATA, publicOf(3), raw)(pjs(remark('orbinum solana probe')))
        ).rejects.toBeInstanceOf(Ed25519TextSignatureError);
    });

    it('refuses a wallet signature over the first, hash-only text', async () => {
        const phantom = async () => fromHex(PHANTOM.short);
        await expect(
            textSignPayload(
                METADATA,
                fromHex(PHANTOM.key),
                phantom
            )(pjs(remark('orbinum solana probe')))
        ).rejects.toBeInstanceOf(Ed25519TextSignatureError);
    });

    it('refuses a signature that is not 64 bytes', async () => {
        const long = async () => new Uint8Array(65).fill(0x11);
        await expect(
            textSignPayload(METADATA, publicOf(6), long)(pjs(remark('a')))
        ).rejects.toThrow(/65-byte signature/);
    });

    it('returns the hex the extrinsic carries: the tag, then the signature', async () => {
        const p = pjs(remark('a'));
        const text = textMessage(signingPayload(p), fromHex(GENESIS), 'System.remark');
        const { signature } = await textSignPayload(METADATA, publicOf(8), signWith(8))(p);
        const expected = ed25519.sign(wrapBytes(text), secret(8));
        expect(signature).toBe(toHex(Uint8Array.of(TAG_ED25519_WRAPPED_TEXT, ...expected)));
    });
});
