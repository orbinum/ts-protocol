import type { FieldKey } from '../fields/index';

/** `PrivateStaking` actions: enter a pool with an ORB note, or exit it with a share note. */
export type PrivateStakingAction =
    | {
          type: 'Enter';
          value: { poolId: number; ownerPk: FieldKey; blinding: FieldKey; minShares: bigint };
      }
    | {
          type: 'Exit';
          value: { poolId: number; ownerPk: FieldKey; blinding: FieldKey; minValue: bigint };
      };
