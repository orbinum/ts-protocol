/**
 * Bound spends (runtime spec 22, `ShieldedPool.bound_spend`): an unshield whose proof
 * commits to an action. `types` the actions, `codec` their encoding, `digest` the
 * proof's `memo_hash`.
 */
export type { BoundAction, FieldKey, PrivateStakingAction } from './types';
export { boundActionArg, decodeBoundAction, encodeBoundAction } from './codec';
export { BOUND_SPEND_DOMAIN, boundSpendDigest } from './digest';
