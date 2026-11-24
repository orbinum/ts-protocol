import type { PrivateCallStep } from '../../../protocol/bound/index';
import type { EvmClient } from '../EvmClient';
import { callFromExecutor, errorMessage } from './call';

/** One step's outcome: what it returned, or the node's error (a revert reason included). */
export type PrivateCallStepResult = { ok: true; returnData: string } | { ok: false; error: string };

/** Calls each step from the executor holding `amount`. */
export async function simulatePrivateCall(
    evm: EvmClient,
    steps: readonly PrivateCallStep[],
    amount: bigint
): Promise<PrivateCallStepResult[]> {
    return Promise.all(
        steps.map(async (step): Promise<PrivateCallStepResult> => {
            try {
                return { ok: true, returnData: await callFromExecutor(evm, step, amount) };
            } catch (e) {
                return { ok: false, error: errorMessage(e) };
            }
        })
    );
}
