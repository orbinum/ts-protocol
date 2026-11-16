/**
 * What `orbinum-verify.wasm` computes, as a pure function: `checkPaymentProof`
 * over JSON, for backends that are not on Node (Python, Go, PHP, Ruby… through
 * any WASI runtime). Kept apart from the stdin/stdout glue so it is tested as
 * plain TypeScript and the module only adds I/O.
 *
 *   in:  {"proof":"orbproof1:…","address":"orbpriv3:…","value":"1500","assetId":"0"}
 *   out: {"ok":true,"payment":{"commitmentHex":"0x…","value":"1500","assetId":"0","sender":{…}},"storageKey":"0x…"}
 *      | {"ok":false,"reason":"invalid-proof"|"wrong-asset"|"wrong-amount", "payment"?: …}
 *      | {"error":"…"}   — the REQUEST is wrong (missing field, bad address): a bug to fix, not a customer to refuse
 *
 * The chain check stays with the host, which already talks to its node. On
 * `ok: true`, read the payment in the FINALIZED chain:
 *
 *   head = chain_getFinalizedHead()
 *   state_getStorage(storageKey, head)
 *
 * A non-null answer means paid and final; null means not paid, or not final
 * yet (retry in a few seconds); an RPC error means retry. Then store
 * `commitmentHex` with the order under a unique constraint — one payment, one
 * order.
 */
import { commitmentLeafIndexKey } from '../src/protocol/payment/finalizedLeaf';
import { checkPaymentProof } from '../src/protocol/payment/verifyProof';

const DIGITS = /^(0|[1-9]\d{0,77})$/;

/** Bigints as decimal strings: JSON has no bigint, and a float would round amounts. */
const plain = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));

export function handle(input: unknown): unknown {
    if (typeof input !== 'object' || input === null)
        return { error: 'input must be a JSON object' };
    // No default asset: a host that forgets it must not accept native payments
    // for an order priced in another asset.
    const { proof, address, value, assetId } = input as Record<string, unknown>;
    if (typeof proof !== 'string') return { error: 'proof must be a string' };
    if (typeof address !== 'string') return { error: 'address must be an orbpriv3 string' };
    if (typeof value !== 'string' || !DIGITS.test(value))
        return { error: 'value must be a decimal string of the smallest unit' };
    if (typeof assetId !== 'string' || !DIGITS.test(assetId))
        return { error: 'assetId must be a decimal string' };
    try {
        const result = checkPaymentProof(proof, {
            address,
            expected: { value: BigInt(value), assetId: BigInt(assetId) },
        });
        return plain(
            result.ok
                ? { ...result, storageKey: commitmentLeafIndexKey(result.payment.commitmentHex) }
                : result
        );
    } catch (error) {
        // checkPaymentProof throws only for a misconfigured address or expectation.
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
