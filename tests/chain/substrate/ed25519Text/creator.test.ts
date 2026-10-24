/**
 * `getEd25519TextSigner` hands each transaction to polkadot-api's pjs creator with a
 * `signPayload` that names calls from that transaction's own metadata, and exposes the
 * account's key and its signer like any `SubstrateSigner`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { AccountId } from '@polkadot-api/substrate-bindings';
import { fromHex, toHex } from '../../../../src/foundation/encoding/hex';
import { wrapBytes } from '../../../../src/chain/substrate/ed25519Text/message';
import { getEd25519TextSigner } from '../../../../src/chain/substrate/ed25519Text/signer';
import { nameOf, pjs, remark } from './fixtures';

const mocks = vi.hoisted(() => ({ getTxCreatorFromPjs: vi.fn(), callNameFrom: vi.fn() }));
vi.mock('polkadot-api/pjs-signer', () => ({ getTxCreatorFromPjs: mocks.getTxCreatorFromPjs }));
vi.mock('../../../../src/chain/substrate/ed25519Text/callName', () => ({
    callNameFrom: mocks.callNameFrom,
}));

const SECRET = new Uint8Array(32).fill(3);
const PUBLIC = ed25519.getPublicKey(SECRET);
const ADDRESS = AccountId(42).dec(PUBLIC);
/** What an extension's signRaw does: sign the bytes inside `<Bytes>`. */
const sign = async (m: Uint8Array) => ed25519.sign(wrapBytes(m), SECRET);

type Creator = (...args: unknown[]) => Promise<string>;
const transaction = (metadata: string) => ({ context: { metadata } });

beforeEach(() => {
    mocks.getTxCreatorFromPjs.mockReset();
    mocks.getTxCreatorFromPjs.mockImplementation(() => vi.fn(async () => '0xextrinsic'));
    mocks.callNameFrom.mockReset();
    mocks.callNameFrom.mockImplementation((_m: string, call: Uint8Array) => nameOf(call));
});

describe('getEd25519TextSigner', () => {
    it('exposes the account key and signs bytes with the given signer', async () => {
        const signer = getEd25519TextSigner(ADDRESS, sign);
        expect(toHex(signer.publicKey)).toBe(toHex(PUBLIC));
        expect(toHex(await signer.signBytes(Uint8Array.of(1)))).toBe(
            toHex(await sign(Uint8Array.of(1)))
        );
    });

    it('delegates each transaction, arguments untouched, to an ed25519 pjs creator', async () => {
        const signer = getEd25519TextSigner(ADDRESS, sign) as unknown as Creator;
        const args = [transaction('0xmeta-a'), { tip: 1n }, { bindings: true }, false];
        await expect(signer(...args)).resolves.toBe('0xextrinsic');

        expect(mocks.getTxCreatorFromPjs).toHaveBeenCalledWith(
            ADDRESS,
            expect.any(Function),
            expect.any(Function),
            'ed25519'
        );
        expect(mocks.getTxCreatorFromPjs.mock.results[0]!.value).toHaveBeenCalledWith(...args);
    });

    it('names calls from the metadata of the transaction being signed', async () => {
        const signer = getEd25519TextSigner(ADDRESS, sign) as unknown as Creator;
        await signer(transaction('0xmeta-a'), {}, {}, false);
        await signer(transaction('0xmeta-b'), {}, {}, false);

        const signPayloadOf = (n: number) => mocks.getTxCreatorFromPjs.mock.calls[n]![1];
        await signPayloadOf(1)(pjs(remark('a')));
        expect(mocks.callNameFrom).toHaveBeenLastCalledWith('0xmeta-b', fromHex(remark('a')));
        await signPayloadOf(0)(pjs(remark('a')));
        expect(mocks.callNameFrom).toHaveBeenLastCalledWith('0xmeta-a', fromHex(remark('a')));
    });

    it('signs the pjs creator’s raw bytes through the same signer', async () => {
        const signer = getEd25519TextSigner(ADDRESS, sign) as unknown as Creator;
        await signer(transaction('0xmeta'), {}, {}, false);
        const signRaw = mocks.getTxCreatorFromPjs.mock.calls[0]![2];
        const { signature } = await signRaw({ address: ADDRESS, data: '0x0102', type: 'bytes' });
        expect(signature).toBe(toHex(await sign(fromHex('0x0102'))));
    });

    it('refuses an address that is not SS58', () => {
        expect(() => getEd25519TextSigner('not-an-address', sign)).toThrow(/Not an SS58 address/);
    });
});
