/**
 * The `PrivateCall` pallet (`evm::private_call`, runtime spec 25): it has no calls of its
 * own — a private call is a `ShieldedPool.bound_spend` — and reports each call it runs.
 */
export { privateCallOutcome, type PrivateCallOutcome } from './outcome';
