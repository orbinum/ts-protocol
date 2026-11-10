/**
 * A transaction signer for an EVM account (runtime spec 21+): the wallet signs the same
 * readable text as an ed25519 account, with `personal_sign` (EIP-191), and the runtime
 * checks it for the account the EVM address maps to (`[h160 ‖ 0x00×12]`).
 *
 * The runtime refuses the raw `Ecdsa` signature over `blake2_256(payload)`: a wallet,
 * MPC or KMS that signs raw digests could be handed one. This text is the only way an
 * EVM account sends a native extrinsic. The signature is recovered locally before it
 * leaves this module: another account or other bytes fail here rather than as a
 * `BadProof` on chain.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { concatBytes } from '@noble/hashes/utils.js';
import { getTxCreatorFromPjs } from 'polkadot-api/pjs-signer';
import type { SignPayload, SignRaw } from 'polkadot-api/pjs-signer';
import { evmToSubstrate } from '../../../foundation/address';
import { fromHex, toHex } from '../../../foundation/encoding/hex';
import { callNameFrom } from './callName';
import { eip191Message, TAG_ECDSA_TEXT, textMessage } from './message';
import { signingPayload } from './payload';
import { assertTextSignable, Ed25519TextSignatureError } from './signer';
import { summaryLines } from './summary';

/**
 * Signs `message` with the EVM wallet's `personal_sign` (the wallet adds the EIP-191
 * prefix) and returns the 65-byte `r ‖ s ‖ v` signature as 0x hex.
 */
export type PersonalSign = (message: Uint8Array) => Promise<string>;

const SIGNATURE_BYTES = 65;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * `r ‖ s ‖ v` (v 0/1 or 27/28) as the runtime takes it, `v` the raw recovery id, if
 * it recovers `evmAddress` from `message`; null otherwise. A high `s` is refused, as
 * the runtime refuses it.
 */
export function recoverEip191(
    signature: Uint8Array,
    message: Uint8Array,
    evmAddress: string
): Uint8Array | null {
    if (signature.length !== SIGNATURE_BYTES || !EVM_ADDRESS.test(evmAddress)) return null;
    const v = signature[64] ?? 0;
    const recovery = v >= 27 ? v - 27 : v;
    if (recovery > 1) return null;
    try {
        const sig = secp256k1.Signature.fromBytes(
            concatBytes(Uint8Array.of(recovery), signature.slice(0, 64)),
            'recovered'
        );
        if (sig.hasHighS()) return null;
        const pub = sig.recoverPublicKey(keccak_256(eip191Message(message))).toBytes(false);
        const address = toHex(keccak_256(pub.slice(1)).slice(12));
        if (address !== evmAddress.toLowerCase()) return null;
    } catch {
        return null;
    }
    return concatBytes(signature.slice(0, 64), Uint8Array.of(recovery));
}

/** The pjs `signPayload` of an EVM account: render the text, sign it, check it, tag it. */
export function ecdsaTextSignPayload(
    metadata: string,
    evmAddress: string,
    sign: PersonalSign
): SignPayload {
    return async (p) => {
        const call = fromHex(p.method);
        const name = callNameFrom(metadata, call);
        assertTextSignable(call, name);
        const summary = summaryLines(call, name, BigInt(p.tip), fromHex(p.era), BigInt(p.nonce));
        const text = textMessage(signingPayload(p), fromHex(p.genesisHash), summary);
        const signature = recoverEip191(fromHex(await sign(text)), text, evmAddress);
        if (!signature) {
            throw new Ed25519TextSignatureError(
                'The wallet signed with another account or other bytes; the transaction was not sent.'
            );
        }
        return { signature: toHex(concatBytes(Uint8Array.of(TAG_ECDSA_TEXT), signature)) };
    };
}

type EcdsaTextSigner = ReturnType<typeof getTxCreatorFromPjs>;

/**
 * The `SubstrateSigner` of an EVM account, for the Substrate account its address maps
 * to. polkadot-api's pjs creator does the rest (nonce, mortality, fee estimation).
 */
export function getEcdsaTextSigner(evmAddress: string, sign: PersonalSign): EcdsaTextSigner {
    if (!EVM_ADDRESS.test(evmAddress)) throw new Error(`Not a 0x EVM address: ${evmAddress}`);
    const address = evmToSubstrate(evmAddress);
    if (!address) throw new Error(`Not an EVM address: ${evmAddress}`);
    // `signBytes` (pjs `signRaw`) has the wallet sign arbitrary bytes with `personal_sign`; no
    // runtime path accepts that as a transaction, so it is not recovered here.
    const signRaw: SignRaw = async ({ data }) => ({ id: 0, signature: await sign(fromHex(data)) });
    const creator = (...args: Parameters<EcdsaTextSigner>) =>
        getTxCreatorFromPjs(
            address,
            ecdsaTextSignPayload(args[0].context.metadata, evmAddress, sign),
            signRaw,
            'ecdsa'
        )(...args);
    const signer = getTxCreatorFromPjs(
        address,
        async () => ({ signature: '0x' }),
        signRaw,
        'ecdsa'
    );
    return Object.assign(creator, {
        publicKey: signer.publicKey,
        signBytes: signer.signBytes,
    }) as EcdsaTextSigner;
}
