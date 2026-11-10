/**
 * Native extrinsics from an ed25519 account (runtime spec 21): the key signs a readable
 * text the runtime renders again from the whole payload, so the wallet shows exactly
 * what is signed.
 *
 *     Orbinum transaction
 *     chain: 0x{genesis}
 *     action: {Pallet}.{call}
 *     {key}: {value}           (the call's lines: recipient, amount, staking and pools)
 *     expires: never | within {period} blocks
 *     nonce: {n}
 *     tip: {n} ORB             (a non-zero tip)
 *     payload: 0x{blake2_256(payload)}
 *
 * - `summary.ts`   the lines under `action:`, as the runtime renders them
 * - `callName.ts`  call names from the runtime metadata
 * - `payload.ts`   the signing payload, from the pjs JSON
 * - `message.ts`   the text, and its `<Bytes>` form for `signRaw`
 * - `signer.ts`    the signer: render, sign, check locally, tag
 * - `ecdsaSigner.ts` the same text signed by an EVM wallet (`personal_sign`, spec 21+)
 */
export { callNameFrom, callNameIn } from './callName';
export type { CallMetadata } from './callName';
export {
    TAG_ECDSA_TEXT,
    TAG_ED25519_TEXT,
    TAG_ED25519_WRAPPED_TEXT,
    eip191Message,
    textMessage,
    wrapBytes,
} from './message';
export { ecdsaTextSignPayload, getEcdsaTextSigner, recoverEip191 } from './ecdsaSigner';
export type { PersonalSign } from './ecdsaSigner';
export { SIGNED_EXTENSIONS, ZERO_SIZED_EXTENSIONS, signingPayload } from './payload';
export type { PjsPayload } from './payload';
export {
    Ed25519TextSignatureError,
    assertTextSignable,
    getEd25519TextSigner,
    textSignPayload,
} from './signer';
export type { SignEd25519 } from './signer';
export {
    MAX_LISTED_ACCOUNTS,
    textExpiry,
    textFingerprint,
    formatOrb,
    textHashFingerprint,
    isTextSignable,
    summaryLines,
} from './summary';
export type { CallName } from './summary';
