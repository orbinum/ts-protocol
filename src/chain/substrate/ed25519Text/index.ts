/**
 * Native extrinsics from an ed25519 account (runtime spec 20+): the key signs a readable
 * text the runtime renders again from the whole payload, so the wallet shows exactly
 * what is signed.
 *
 *     Orbinum transaction
 *     chain: 0x{genesis}
 *     action: {Pallet}.{call}
 *     to: 0x{account}          (balance transfers)
 *     amount: {n} ORB          (balance transfers, ORB shields and fee claims)
 *     tip: {n} ORB             (a non-zero tip)
 *     payload: 0x{blake2_256(payload)}
 *
 * - `summary.ts`   the lines under `action:`, as the runtime renders them
 * - `callName.ts`  call names from the runtime metadata
 * - `payload.ts`   the signing payload, from the pjs JSON
 * - `message.ts`   the text, and its `<Bytes>` form for `signRaw`
 * - `signer.ts`    the signer: render, sign, check locally, tag
 */
export { callNameFrom, callNameIn } from './callName';
export type { CallMetadata } from './callName';
export { TAG_ED25519_TEXT, TAG_ED25519_WRAPPED_TEXT, textMessage, wrapBytes } from './message';
export { SIGNED_EXTENSIONS, signingPayload } from './payload';
export type { PjsPayload } from './payload';
export { Ed25519TextSignatureError, getEd25519TextSigner, textSignPayload } from './signer';
export type { SignEd25519 } from './signer';
export { formatOrb, summaryLines } from './summary';
export type { CallName } from './summary';
