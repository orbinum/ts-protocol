/**
 * The public parts of the shielded-pool protocol.
 *
 * ```
 * memo/        the memo wire format and the payment slip a dapp hands a wallet
 * disclosure/  the orbdisc: share/verify pair (prove a note's value, not spend)
 * spend/       forest geometry (tree math) — coin selection is private (wallet)
 * types.ts     the shared vocabulary for public chain data
 * ```
 *
 * Note construction, ephemerals, key derivation and proving are NOT here: the
 * witness they assemble carries the spending key, which does not belong in a
 * package anyone can install. The types they need — build params, an opened
 * memo — are absent for the same reason.
 *
 * Pure and offline: no chain access, no storage, no environment.
 */
export * from './memo/index';
export * from './disclosure/index';
export * from './spend/index';
export type { MerkleTreeInfo, ScanCommitment, NoteFacts } from './types';
export { CURRENT_CIRCUIT_VERSION } from './types';
