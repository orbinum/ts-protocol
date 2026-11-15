/** A 32-byte field element (owner key or blinding), little-endian. */
export type FieldKey = Uint8Array;

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

/** The runtime's `BoundAction`: what a bound spend hands its value to. */
export type BoundAction = { type: 'PrivateStaking'; value: PrivateStakingAction };
