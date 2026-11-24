/** `PrivateStaking`: enter or leave a nomination pool with a note (runtime spec 22). */
export type { PrivateStakingAction } from './types';
export { assertPrivateStakingAction } from './check';
export { privateStakingCodec, privateStakingFields, readPrivateStaking } from './codec';
