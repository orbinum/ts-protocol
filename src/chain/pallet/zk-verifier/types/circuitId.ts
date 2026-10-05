/**
 * On-chain circuit identifier (a u32 newtype on-chain).
 * Use the {@link CircuitId} constant object for named values.
 */
export type CircuitId = (typeof CircuitId)[keyof typeof CircuitId];

/**
 * The circuits the chain verifies.
 *
 * Values MUST match the node's `CircuitId` constants
 * (`node/frame/zk-verifier/src/types.rs`). Ids are never reused, so retired
 * circuits (5 private_link, 6 value_proof) leave permanent gaps.
 *
 * | Name     | Value | Circuit                     |
 * |----------|-------|-----------------------------|
 * | Transfer | 1     | 2-in-2-out private transfer |
 * | Unshield | 2     | Withdrawal from the pool    |
 * | Shield   | 3     | Deposit into the pool       |
 */
export const CircuitId = {
    Transfer: 1,
    Unshield: 2,
    Shield: 3,
} as const;
