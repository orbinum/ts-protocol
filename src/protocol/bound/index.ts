/**
 * Bound spends (runtime spec 22, `ShieldedPool.bound_spend`): an unshield whose proof
 * commits to an action.
 *
 * ```
 * action/          the `BoundAction` union: its checks, call argument and encoding
 * privateStaking/  enter or leave a nomination pool with a note (spec 22)
 * privateCall/     call EVM contracts from the shared executor (spec 25)
 * fields/          integers, keys and decoding every action shares
 * digest/          the proof's `memo_hash`
 * ```
 */
export {
    assertBoundAction,
    boundActionArg,
    decodeBoundAction,
    encodeBoundAction,
    type BoundAction,
} from './action/index';
export type { FieldKey } from './fields/index';
export type { PrivateStakingAction } from './privateStaking/index';
export {
    PRIVATE_CALL_EXECUTOR,
    PRIVATE_CALL_EXECUTOR_ACCOUNT_ID,
    PRIVATE_CALL_MAX_GAS,
    PRIVATE_CALL_MAX_INPUT,
    PRIVATE_CALL_MAX_STEPS,
    assertPrivateCallRequest,
    assertPrivateCallTerms,
    privateCallGasLimit,
    privateCallIntrinsicGas,
    privateCallMinFee,
    type PrivateCallRequest,
    type PrivateCallStep,
    type PrivateCallTerms,
} from './privateCall/index';
export { BOUND_SPEND_DOMAIN, boundSpendDigest } from './digest/index';
