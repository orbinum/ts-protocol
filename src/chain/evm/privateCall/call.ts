import { toHex } from '../../../foundation/encoding/hex';
import { PRIVATE_CALL_EXECUTOR, type PrivateCallStep } from '../../../protocol/bound/index';
import type { EvmClient } from '../EvmClient';

const quantity = (n: bigint) => '0x' + n.toString(16);

/** A thrown value's message. */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * `step` as an `eth_call` from the executor holding `amount` (a state override, since
 * the executor holds nothing between calls), at the latest block, with `gas` if given.
 */
export function callFromExecutor(
    evm: EvmClient,
    step: PrivateCallStep,
    amount: bigint,
    gas?: bigint
): Promise<string> {
    const tx = {
        from: PRIVATE_CALL_EXECUTOR,
        to: step.target,
        data: toHex(step.input),
        value: quantity(step.value),
        ...(gas !== undefined && { gas: quantity(gas) }),
    };
    const override = { [PRIVATE_CALL_EXECUTOR]: { balance: quantity(amount) } };
    return evm.request<string>('eth_call', [tx, 'latest', override]);
}
