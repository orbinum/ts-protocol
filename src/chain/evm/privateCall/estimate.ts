import {
    PRIVATE_CALL_MAX_GAS,
    privateCallIntrinsicGas,
    type PrivateCallStep,
} from '../../../protocol/bound/index';
import type { EvmClient } from '../EvmClient';
import { callFromExecutor, errorMessage } from './call';

/** One step's gas: the least gas limit it succeeds with, or why it fails with the most. */
export type PrivateCallStepGas = { ok: true; gas: bigint } | { ok: false; error: string };

/**
 * The least gas each step succeeds with, called from the executor holding `amount`:
 * a search over `eth_call`'s gas, since `eth_estimateGas` takes no state override. The
 * result is within 1/64 above the least (a contract may need more as its gas runs low).
 * Measure the steps with the values they will send: a call that carries value costs more.
 * `privateCallGasLimit` turns the result into the call's gas limit.
 */
export async function estimatePrivateCallGas(
    evm: EvmClient,
    steps: readonly PrivateCallStep[],
    amount: bigint
): Promise<PrivateCallStepGas[]> {
    return Promise.all(steps.map((step) => leastGas(evm, step, amount)));
}

async function leastGas(
    evm: EvmClient,
    step: PrivateCallStep,
    amount: bigint
): Promise<PrivateCallStepGas> {
    try {
        await callFromExecutor(evm, step, amount, PRIVATE_CALL_MAX_GAS);
    } catch (e) {
        return { ok: false, error: errorMessage(e) };
    }
    // `low` fails (below the intrinsic gas), `high` succeeds.
    let low = privateCallIntrinsicGas([step]) - 1n;
    let high = PRIVATE_CALL_MAX_GAS;
    while (high - low > high / 64n) {
        const mid = (low + high) / 2n;
        try {
            await callFromExecutor(evm, step, amount, mid);
            high = mid;
        } catch {
            low = mid;
        }
    }
    return { ok: true, gas: high };
}
