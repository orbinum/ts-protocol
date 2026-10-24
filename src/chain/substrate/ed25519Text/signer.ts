/**
 * A transaction signer for an ed25519 account (runtime spec 20+).
 *
 * The runtime never accepts a raw ed25519 signature over the signing payload: a key that
 * signs arbitrary bytes could be talked into authorising a transaction shown as a "login
 * nonce". The key signs the readable text instead, and the signature is checked locally
 * against both forms before it leaves this module, so another key or other bytes fail
 * here rather than as a `BadProof` on chain.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { concatBytes } from '@noble/hashes/utils.js';
import { getSs58AddressInfo } from 'polkadot-api';
import { getTxCreatorFromPjs } from 'polkadot-api/pjs-signer';
import type { SignPayload, SignRaw } from 'polkadot-api/pjs-signer';
import { fromHex, toHex } from '../../../foundation/encoding/hex';
import { callNameFrom } from './callName';
import { TAG_ED25519_TEXT, TAG_ED25519_WRAPPED_TEXT, textMessage, wrapBytes } from './message';
import { signingPayload } from './payload';
import { summaryLines } from './summary';

/**
 * Signs bytes with the account's ed25519 key: a wallet's `signRaw` (which signs them
 * inside `<Bytes>`), or a local keypair (which signs them as given).
 */
export type SignEd25519 = (message: Uint8Array) => Promise<Uint8Array>;

/** The key signed something other than the transaction text; nothing was sent. */
export class Ed25519TextSignatureError extends Error {
    override name = 'Ed25519TextSignatureError';
}

const SIGNATURE_BYTES = 64;

/** `0x04` for a signature over the `<Bytes>`-wrapped text, `0x03` for the bare text. */
function tagFor(sig: Uint8Array, text: Uint8Array, publicKey: Uint8Array): number | null {
    if (ed25519.verify(sig, wrapBytes(text), publicKey)) return TAG_ED25519_WRAPPED_TEXT;
    if (ed25519.verify(sig, text, publicKey)) return TAG_ED25519_TEXT;
    return null;
}

/**
 * The pjs `signPayload` of an ed25519 account: renders the text with call names from
 * `metadata` (the runtime the transaction is built against), signs it, and returns the
 * tagged `OrbinumSignature`.
 */
export function textSignPayload(
    metadata: string,
    publicKey: Uint8Array,
    sign: SignEd25519
): SignPayload {
    return async (p) => {
        const call = fromHex(p.method);
        const summary = summaryLines(call, callNameFrom(metadata, call), BigInt(p.tip));
        const text = textMessage(signingPayload(p), fromHex(p.genesisHash), summary);
        const sig = await sign(text);
        if (sig.length !== SIGNATURE_BYTES) {
            throw new Ed25519TextSignatureError(
                `The wallet returned a ${sig.length}-byte signature; ed25519 signatures are 64 bytes.`
            );
        }
        const tag = tagFor(sig, text, publicKey);
        if (tag === null) {
            throw new Ed25519TextSignatureError(
                'The wallet signed with another key or other bytes; the transaction was not sent.'
            );
        }
        return { signature: toHex(concatBytes(Uint8Array.of(tag), sig)) };
    };
}

type Ed25519TextSigner = ReturnType<typeof getTxCreatorFromPjs>;

/**
 * The `SubstrateSigner` of an ed25519 account.
 *
 * polkadot-api's pjs creator does the rest (nonce, mortality, tip, fee estimation,
 * assembling the extrinsic), and the signature it gets back becomes the extrinsic's
 * signature byte for byte, tag included. It is built per transaction so its `signPayload`
 * names calls from that transaction's runtime metadata.
 */
export function getEd25519TextSigner(address: string, sign: SignEd25519): Ed25519TextSigner {
    const info = getSs58AddressInfo(address);
    if (!info.isValid) throw new Error(`Not an SS58 address: ${address}`);
    const { publicKey } = info;
    const signRaw: SignRaw = async ({ data }) => ({
        id: 0,
        signature: toHex(await sign(fromHex(data))),
    });
    const creator = (...args: Parameters<Ed25519TextSigner>) =>
        getTxCreatorFromPjs(
            address,
            textSignPayload(args[0].context.metadata, publicKey, sign),
            signRaw,
            'ed25519'
        )(...args);
    return Object.assign(creator, { publicKey, signBytes: sign }) as Ed25519TextSigner;
}
