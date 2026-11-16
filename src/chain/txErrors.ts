/**
 * Reading a failed call: the pallet error a dispatch carries, and the failures that
 * come from no pallet at all (the pool, the signature, the connection). Hosts word
 * them; what each one is lives here.
 */

/**
 * A DispatchError as its variant path: `Staking.NotStash` for a module error (the
 * `Module` wrapper is skipped), `Token.FundsUnavailable`, `BadOrigin`. Accepts PAPI's
 * decoded value, a bare variant name, or the `{ dispatch_error }` an event carries.
 * Null when it is not a variant.
 */
export function dispatchErrorPath(value: unknown): string | null {
    let cur: unknown =
        value && typeof value === 'object' && 'dispatch_error' in value
            ? (value as { dispatch_error: unknown }).dispatch_error
            : value;
    const path: string[] = [];
    while (cur != null) {
        if (typeof cur === 'string') {
            path.push(cur);
            break;
        }
        const type = typeof cur === 'object' ? (cur as { type?: unknown }).type : undefined;
        if (typeof type !== 'string') break;
        path.push(type);
        cur = (cur as { value?: unknown }).value;
    }
    if (path[0] === 'Module' && path.length > 1) path.shift();
    return path.length ? path.join('.') : null;
}

/** The pallet error in a submit failure (`Module(Pallet.Error)`, as `TxResult.error` writes it), or null. */
export function parseModuleError(raw: string): { pallet: string; error: string } | null {
    const match = /Module\((\w+)\.(\w+)\)/.exec(raw);
    return match ? { pallet: match[1]!, error: match[2]! } : null;
}

/**
 * A failure that is not a pallet error:
 * - `dropped`: never mined; safe to retry.
 * - `pending`: not mined yet, and may still be; retrying could pay twice.
 * - `outdated`: a nonce or a nullifier already used.
 * - `cannot-pay-fees`: the account cannot cover the fee.
 * - `bad-signature`: the runtime refused the signature (`BadProof`).
 * - `disconnected`: the connection dropped before an answer.
 */
export type TxErrorKind =
    | 'dropped'
    | 'pending'
    | 'outdated'
    | 'cannot-pay-fees'
    | 'bad-signature'
    | 'disconnected';

const TX_ERRORS: [RegExp, TxErrorKind][] = [
    [/dropped from the tx pool/i, 'dropped'],
    [/still pending after \d+ms/i, 'pending'],
    [/Transaction is outdated/i, 'outdated'],
    [/Inability to pay some fees/i, 'cannot-pay-fees'],
    [/BadProof|bad signature/i, 'bad-signature'],
    [/client destroyed|disconnected|node is unreachable/i, 'disconnected'],
];

/** What kind of non-pallet failure `raw` is, or null. */
export function classifyTxError(raw: string): TxErrorKind | null {
    return TX_ERRORS.find(([pattern]) => pattern.test(raw))?.[1] ?? null;
}

/** The first transaction hash (0x + 32 bytes hex) in an error message, or null. */
export function extractTxHash(raw: string): string | null {
    return /0x[a-fA-F0-9]{64}/.exec(raw)?.[0] ?? null;
}
