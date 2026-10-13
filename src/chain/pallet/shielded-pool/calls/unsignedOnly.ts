/**
 * The shielded-pool calls the runtime accepts only unsigned.
 *
 * A spend carries no account: the proof authorises it and the fee comes out of
 * the note. A signature would add the one thing the spend is built to hide —
 * who sent it — and the runtime rejects it only after the extrinsic, with the
 * signer next to its nullifiers, has reached the node.
 */

const PALLET = 'ShieldedPool';
const UNSIGNED_ONLY_CALLS: ReadonlySet<unknown> = new Set(['private_transfer', 'unshield']);

/** Nesting followed into wrapper calls (batch, proxy, …) before giving up. */
const MAX_DEPTH = 16;

/**
 * Whether a PAPI decoded call (`{ type: pallet, value: { type: call, value } }`)
 * is, or wraps, a spend.
 */
export function isOrWrapsUnsignedOnlyCall(call: unknown, depth = 0): boolean {
    if (
        depth > MAX_DEPTH ||
        call === null ||
        typeof call !== 'object' ||
        ArrayBuffer.isView(call)
    ) {
        return false;
    }
    const c = call as { type?: unknown; value?: { type?: unknown } };
    if (c.type === PALLET && UNSIGNED_ONLY_CALLS.has(c.value?.type)) return true;
    return Object.values(call).some((v) => isOrWrapsUnsignedOnlyCall(v, depth + 1));
}

/** Throws before a spend, alone or wrapped, is handed to a signer. */
export function assertNotSignedSpend(tx: { decodedCall: unknown }): void {
    if (isOrWrapsUnsignedOnlyCall(tx.decodedCall)) {
        throw new Error(
            'Refusing to sign a shielded-pool spend: private_transfer and unshield are ' +
                'submitted unsigned, and a signature would tie the account to its nullifiers'
        );
    }
}
