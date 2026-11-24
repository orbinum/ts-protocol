import type { PrivateCallRequest } from '../privateCall/index';
import type { PrivateStakingAction } from '../privateStaking/index';

/** The runtime's `BoundAction`: what a bound spend hands its value to. */
export type BoundAction =
    | { type: 'PrivateStaking'; value: PrivateStakingAction }
    | { type: 'PrivateCall'; value: PrivateCallRequest };
