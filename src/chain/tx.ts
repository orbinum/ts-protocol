import type { TxFinalizedPayload } from 'polkadot-api';
import type { SignerTxCreator as SubstrateSigner } from 'polkadot-api/tx-creator';
import type { SubstrateClient } from './substrate/SubstrateClient';
import type { TxResult } from './client/types';

/**
 * Transaction options for PAPI's UnsafeApi (no typed asset).
 *
 * polkadot-api 3 dropped the `TxOptions<Asset, Extensions>` generic: options are
 * now inferred per creator from the chain's signed extensions, which an unsafe
 * (untyped) call has no descriptors to infer from. A loose record is what that
 * path was already passing — the previous generic resolved to the same shape.
 */
export type UnsafeTxOptions = Record<string, unknown>;

/**
 * `UnsafeTxOptions` plus the one lifecycle hook a wallet UI needs.
 *
 * `onBroadcast` fires when the node's mempool acknowledges the tx — long before
 * finalization. Without it the only observable signal is the finalized block,
 * seconds later, and a UI cannot tell "the tx left the wallet" from "nothing
 * happened yet".
 */
export type SubmitOptions = UnsafeTxOptions & {
    onBroadcast?: () => void;
};

/**
 * Formats a `dispatchError` from polkadot-api into a human-readable string.
 *
 * polkadot-api surfaces: `{ type: string; value: unknown }`
 *  - `type === "Module"` → `value` is `{ type: "PalletName.ErrorVariant"; value: unknown }`
 *  - `type === "Other" | "BadOrigin" | ...` → no inner value needed
 */
function formatDispatchError(err: { type: string; value: unknown }): string {
    if (err.type === 'Module') {
        const inner = err.value as { type?: string; value?: unknown } | undefined;
        if (inner?.type) {
            return `Module(${inner.type})`;
        }
    }
    // Fallback: serialize whatever we have for maximum debuggability
    try {
        const detail = JSON.stringify(err.value);
        return detail && detail !== 'null' ? `${err.type}(${detail})` : err.type;
    } catch {
        return err.type;
    }
}

export function toTxResult(payload: TxFinalizedPayload): TxResult {
    const base = {
        txHash: payload.txHash,
        blockHash: payload.block.hash,
        blockNumber: payload.block.number,
        ok: payload.ok,
    };
    if (!payload.ok) {
        return { ...base, error: formatDispatchError(payload.dispatchError) };
    }
    return base;
}

/**
 * The fee actually charged for a signed extrinsic, from the block's own events.
 *
 * `TransactionPayment.TransactionFeePaid` is the only place this exists: the fee
 * depends on the extrinsic's real weight and the block's congestion, so it is
 * not knowable before submission and is not carried on the transaction. Reading
 * it here is what lets a caller show what a substrate-signed operation cost —
 * the EVM path recovers the same figure from its receipt's gas fields.
 *
 * Returns null when the event is absent, which is the honest answer rather than
 * a zero: an unsigned (gasless) extrinsic pays no fee and never emits it.
 */
export function feePaidFrom(payload: TxFinalizedPayload): string | null {
    const events = (payload as { events?: unknown }).events;
    if (!Array.isArray(events)) return null;
    for (const record of events) {
        const ev = record as { type?: string; value?: { type?: string; value?: unknown } };
        if (ev?.type !== 'TransactionPayment') continue;
        if (ev.value?.type !== 'TransactionFeePaid') continue;
        const data = ev.value.value as { actual_fee?: unknown } | undefined;
        const fee = data?.actual_fee;
        if (typeof fee === 'bigint') return fee.toString();
        if (typeof fee === 'string' || typeof fee === 'number') return String(fee);
        return null;
    }
    return null;
}

/**
 * The shape this SDK needs from a PAPI transaction.
 *
 * Declared here rather than imported: the unsafe (untyped) path has no chain
 * descriptors, so PAPI's own `Transaction` generic cannot be instantiated for
 * it. The method names track polkadot-api 3, where signing moved behind a
 * `TxCreator` — `signAndSubmit(signer)` became `createAndSubmit(creator)`, and
 * the creator, not the transaction, now owns the key.
 */
export interface UnsafeTx {
    createAndSubmit(
        creator: SubstrateSigner,
        options?: UnsafeTxOptions
    ): Promise<TxFinalizedPayload>;
    createSubmitAndWatch(
        creator: SubstrateSigner,
        options?: UnsafeTxOptions
    ): {
        subscribe(observer: {
            next(event: { type: string }): void;
            error(err: unknown): void;
        }): unknown;
    };
    getBareTx(): Promise<Uint8Array>;
}

export function callUnsafeTx(txEntry: unknown, ...args: unknown[]): UnsafeTx {
    return (txEntry as (...a: unknown[]) => UnsafeTx)(...args);
}

/**
 * Signs and submits, resolving on finalization.
 *
 * With `onBroadcast` the tx goes through `signSubmitAndWatch`, whose event
 * stream is the only place the mempool acknowledgement is visible; without it
 * the plain promise path is kept, byte-for-byte the behaviour every existing
 * caller had.
 */
export function signAndSubmitTx(
    tx: UnsafeTx,
    signer: SubstrateSigner,
    options?: SubmitOptions
): Promise<TxResult> {
    const { onBroadcast, ...txOptions } = options ?? {};
    const opts = Object.keys(txOptions).length > 0 ? (txOptions as UnsafeTxOptions) : undefined;

    if (!onBroadcast) {
        return (
            opts !== undefined ? tx.createAndSubmit(signer, opts) : tx.createAndSubmit(signer)
        ).then(toTxResult);
    }

    return new Promise<TxResult>((resolve, reject) => {
        const stream =
            opts !== undefined
                ? tx.createSubmitAndWatch(signer, opts)
                : tx.createSubmitAndWatch(signer);
        stream.subscribe({
            next(event) {
                if (event.type === 'broadcasted') onBroadcast();
                if (event.type === 'finalized')
                    resolve(toTxResult(event as unknown as TxFinalizedPayload));
            },
            error: reject,
        });
    });
}

/**
 * Submits an unsigned (bare) transaction using polkadot-api's getBareTx().
 * Used for gasless private_transfer and unshield where no signer is available.
 */
export async function submitBareTx(
    tx: { getBareTx(): Promise<Uint8Array> },
    client: SubstrateClient,
    onBroadcast?: () => void
): Promise<TxResult> {
    const bareTx = await tx.getBareTx();
    // The unsigned path has no event stream — `submit` resolves only at
    // finalization. Firing before the await is the closest observable moment to
    // "the tx left the wallet", and matches what a signed submit reports.
    onBroadcast?.();
    const payload = await client.submitUnsignedAndWatch(bareTx);
    return toTxResult(payload);
}

export function resolveTx(unsafe: unknown, pallet: string, call: string): unknown {
    const u = unsafe as Record<string, Record<string, Record<string, unknown>>>;
    const p = u['tx']?.[pallet] as Record<string, unknown> | undefined;
    if (p === undefined) throw new Error(`Pallet "${pallet}" not found in runtime metadata`);
    const entry = p[call];
    if (entry === undefined)
        throw new Error(`Call "${pallet}.${call}" not found in runtime metadata`);
    return entry;
}
