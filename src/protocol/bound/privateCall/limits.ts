/** The executor every private call is made from, and the runtime's bounds on a call. */

/** The address every private call is made from: `H160(*b"orbinum/private-call")`. */
export const PRIVATE_CALL_EXECUTOR = '0x6f7262696e756d2f707269766174652d63616c6c';

/** The executor's account, the bound spend's recipient: its address and 12 zero bytes. */
export const PRIVATE_CALL_EXECUTOR_ACCOUNT_ID = PRIVATE_CALL_EXECUTOR + '00'.repeat(12);

/** Most steps per call. */
export const PRIVATE_CALL_MAX_STEPS = 8;
/** Most calldata per step, in bytes. */
export const PRIVATE_CALL_MAX_INPUT = 16 * 1024;
/** Most gas per call: a quarter of a block's (`BlockGasLimit`, 75 000 000). */
export const PRIVATE_CALL_MAX_GAS = 18_750_000n;
