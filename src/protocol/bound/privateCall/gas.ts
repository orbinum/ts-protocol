/** A private call's gas, as the runtime counts it, and the fee that pays for it. */
import type { PrivateCallStep } from './types';

/** The EVM's per-call base cost and calldata costs (`gas_transaction_*`). */
const CALL_GAS = 21_000n;
const ZERO_BYTE_GAS = 4n;
const NON_ZERO_BYTE_GAS = 16n;

/**
 * The gas the EVM charges `steps` before running them. The runtime refuses a gas limit
 * below it: the fee grows with the call's size, which an unsigned spend pays no length fee for.
 */
export function privateCallIntrinsicGas(steps: readonly PrivateCallStep[]): bigint {
    let gas = 0n;
    for (const step of steps) {
        let zeros = 0n;
        for (const byte of step.input) if (byte === 0) zeros++;
        const nonZeros = BigInt(step.input.length) - zeros;
        gas += CALL_GAS + zeros * ZERO_BYTE_GAS + nonZeros * NON_ZERO_BYTE_GAS;
    }
    return gas;
}

/**
 * The gas limit a call needs when its steps need `stepGas` each, in order (measure them
 * with `estimatePrivateCallGas`). The runtime shares the limit by a bound on each step's
 * gross gas: a step reports its gas net of refunds, which reach at most a fifth of the
 * gross, so every step but the last counts its gas and a quarter more.
 */
export function privateCallGasLimit(stepGas: readonly bigint[]): bigint {
    const last = stepGas.length - 1;
    return stepGas.reduce((sum, gas, i) => sum + gas + (i < last ? gas / 4n : 0n), 0n);
}

/**
 * The least fee a private call with `gasLimit` pays: a spend's (`ShieldedPool.MinSpendFee`)
 * and the whole gas limit at `gasPrice`. The runtime prices the gas at the base fee of the
 * block that admits the call; pass a price with headroom (`EvmClient.getGasPrice`).
 */
export function privateCallMinFee(gasLimit: bigint, gasPrice: bigint, minSpendFee: bigint): bigint {
    return minSpendFee + gasLimit * gasPrice;
}
