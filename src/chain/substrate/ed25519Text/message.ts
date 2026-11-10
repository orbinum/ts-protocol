/**
 * The text an ed25519 account signs, and the `<Bytes>` form an extension's `signRaw`
 * signs for it. `payload` is the whole signing payload: the `payload:` line binds the
 * signature to every byte, the summary to what the person sees.
 */
import { blake2b } from '@noble/hashes/blake2.js';
import { concatBytes as concat } from '@noble/hashes/utils.js';
import { toHex } from '../../../foundation/encoding/hex';

/** `OrbinumSignature::Ed25519Text`: the bare text (wallets that sign text as given). */
export const TAG_ED25519_TEXT = 0x03;
/** `OrbinumSignature::Ed25519WrappedText`: the text in `<Bytes>` (an extension's `signRaw`). */
export const TAG_ED25519_WRAPPED_TEXT = 0x04;
export const TAG_ECDSA_TEXT = 0x05;

/** What an EVM wallet's `personal_sign` hashes (EIP-191): prefix, decimal byte length, message. */
export const eip191Message = (message: Uint8Array) =>
    concat(utf8(`\x19Ethereum Signed Message:\n${message.length}`), message);

const utf8 = (s: string) => new TextEncoder().encode(s);

export const textMessage = (payload: Uint8Array, genesis: Uint8Array, summary: string) =>
    utf8(
        `Orbinum transaction\nchain: ${toHex(genesis)}\naction: ${summary}\npayload: ${toHex(blake2b(payload, { dkLen: 32 }))}`
    );

/** What a Substrate extension's `signRaw` signs for `message` (polkadot-js `u8aWrapBytes`). */
export const wrapBytes = (message: Uint8Array) =>
    concat(utf8('<Bytes>'), message, utf8('</Bytes>'));
