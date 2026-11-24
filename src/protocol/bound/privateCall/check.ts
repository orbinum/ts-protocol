/** What the runtime refuses of a private call, checked before any proof is paid for. */
import { isEvmAddress } from '../../../foundation/address';
import { assertFieldKey, assertU128, assertU32, assertU64, U128_MAX } from '../fields/index';
import { privateCallIntrinsicGas } from './gas';
import { PRIVATE_CALL_MAX_GAS, PRIVATE_CALL_MAX_INPUT, PRIVATE_CALL_MAX_STEPS } from './limits';
import type { PrivateCallRequest, PrivateCallTerms } from './types';

/**
 * Throws on what the runtime refuses of a call's terms: its deadline, gas limit (between
 * the steps' intrinsic gas and a quarter of a block's), steps and `minReturn`. `amount`,
 * when given, is what the spend pays the executor: the steps may send no more. Whether
 * the deadline has passed and the fee are checked against the chain by the runtime.
 */
export function assertPrivateCallTerms(
    terms: PrivateCallTerms,
    where: string,
    amount?: bigint
): void {
    const { deadline, gasLimit, steps, minReturn } = terms;
    assertU32(deadline, `${where}.deadline`);
    assertU64(gasLimit, `${where}.gasLimit`);
    assertU128(minReturn, `${where}.minReturn`);
    if (!Array.isArray(steps) || steps.length === 0 || steps.length > PRIVATE_CALL_MAX_STEPS) {
        throw new Error(`${where}.steps: expected 1 to ${PRIVATE_CALL_MAX_STEPS} steps`);
    }
    let sent = 0n;
    steps.forEach((step, i) => {
        const at = `${where}.steps[${i}]`;
        if (typeof step.target !== 'string' || !isEvmAddress(step.target)) {
            throw new Error(`${at}.target: expected a 20-byte 0x address`);
        }
        if (!(step.input instanceof Uint8Array) || step.input.length > PRIVATE_CALL_MAX_INPUT) {
            throw new Error(`${at}.input: expected at most ${PRIVATE_CALL_MAX_INPUT} bytes`);
        }
        assertU128(step.value, `${at}.value`);
        sent += step.value;
    });
    if (sent > U128_MAX || (amount !== undefined && sent > amount)) {
        throw new Error(`${where}.steps: they send more than the spend's amount`);
    }
    const intrinsic = privateCallIntrinsicGas(steps);
    if (gasLimit < intrinsic) {
        throw new Error(`${where}.gasLimit: below the steps' intrinsic gas (${intrinsic})`);
    }
    if (gasLimit > PRIVATE_CALL_MAX_GAS) {
        throw new Error(`${where}.gasLimit: above a call's most gas (${PRIVATE_CALL_MAX_GAS})`);
    }
}

/** `assertPrivateCallTerms`, and the minted note's key and blinding. */
export function assertPrivateCallRequest(
    request: PrivateCallRequest,
    where: string,
    amount?: bigint
): void {
    assertPrivateCallTerms(request, where, amount);
    assertFieldKey(request.ownerPk, `${where}.ownerPk`);
    assertFieldKey(request.blinding, `${where}.blinding`);
}
