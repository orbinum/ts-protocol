/**
 * Parameter checks for the pallet calls, shared with the precompile's `shield`
 * calldata: both reach the same dispatchable, so they must accept exactly the
 * same values.
 *
 * These throw: the parameters are the wallet's own outgoing call, so a bad one
 * is a bug in the caller, not hostile input to tolerate.
 */
export { assertU32 } from './primitives';
export { assertShieldParams } from './shield';
export { assertMerkleRoots, assertUnshieldParams, assertPrivateTransferParams } from './spends';
export { assertClaimFeesParams } from './fees';
