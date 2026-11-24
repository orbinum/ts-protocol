/** What the runtime refuses of a bound action, by action. */
import { assertPrivateCallRequest } from '../privateCall/index';
import { assertPrivateStakingAction } from '../privateStaking/index';
import type { BoundAction } from './types';

/**
 * Throws on what the runtime refuses of `action`. `amount`, when given, is what the spend
 * pays the executor: a private call's steps may send no more.
 */
export function assertBoundAction(action: BoundAction, where: string, amount?: bigint): void {
    switch (action?.type) {
        case 'PrivateStaking':
            return assertPrivateStakingAction(action.value, where);
        case 'PrivateCall':
            return assertPrivateCallRequest(action.value, where, amount);
        default:
            throw new Error(`${where}: unknown action`);
    }
}

/** `assertBoundAction`, returning the action. */
export function checkBoundAction(action: BoundAction, where = 'BoundAction'): BoundAction {
    assertBoundAction(action, where);
    return action;
}
