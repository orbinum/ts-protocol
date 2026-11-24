/**
 * The runtime's `BoundAction`, over every action module: `types` the union, `check` what
 * the runtime refuses, `codec` the call argument, the SCALE encoding and reading it back.
 */
export type { BoundAction } from './types';
export { assertBoundAction, checkBoundAction } from './check';
export { boundActionArg, decodeBoundAction, encodeBoundAction } from './codec';
