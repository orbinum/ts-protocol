import { assertFieldKey, assertU128, assertU32 } from '../fields/index';
import type { PrivateStakingAction } from './types';

/** Throws on what the runtime refuses of a `PrivateStaking` action. */
export function assertPrivateStakingAction(action: PrivateStakingAction, where: string): void {
    const type = action?.type;
    if (type !== 'Enter' && type !== 'Exit') throw new Error(`${where}: unknown action`);
    const { value } = action;
    assertU32(value.poolId, `${where}.poolId`);
    if (type === 'Enter') assertU128(action.value.minShares, `${where}.minShares`);
    else assertU128(action.value.minValue, `${where}.minValue`);
    assertFieldKey(value.ownerPk, `${where}.ownerPk`);
    assertFieldKey(value.blinding, `${where}.blinding`);
}
