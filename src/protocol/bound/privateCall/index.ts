/**
 * Private calls (`evm::private_call`, runtime spec 25): a bound spend whose action is a
 * `PrivateCallRequest`. The spend pays the executor, a keyless address every private call
 * shares, which calls each step and hands back what it holds as one note.
 *
 * `limits` the executor and the runtime's bounds, `gas` the gas and fee, `check` what the
 * runtime refuses, `codec` the request's encoding.
 */
export type { PrivateCallRequest, PrivateCallStep, PrivateCallTerms } from './types';
export {
    PRIVATE_CALL_EXECUTOR,
    PRIVATE_CALL_EXECUTOR_ACCOUNT_ID,
    PRIVATE_CALL_MAX_GAS,
    PRIVATE_CALL_MAX_INPUT,
    PRIVATE_CALL_MAX_STEPS,
} from './limits';
export { privateCallGasLimit, privateCallIntrinsicGas, privateCallMinFee } from './gas';
export { assertPrivateCallRequest, assertPrivateCallTerms } from './check';
export { privateCallCodec, privateCallFields, readPrivateCall } from './codec';
