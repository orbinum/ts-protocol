import type { TxFinalizedPayload } from 'polkadot-api';
import type { SignerTxCreator as SubstrateSigner } from 'polkadot-api/tx-creator';
import type { SubstrateClient } from './substrate/SubstrateClient';
import type { TxResult } from './client/types';
import { assertNotSignedSpend } from './pallet/shielded-pool/calls/unsignedOnly';

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
    /**
     * Called once the tx is signed, with its hash: before anything can drop it, so a
     * host keeps a hash to look the tx up by even if the connection fails afterwards.
     */
    onSigned?: (txHash: string) => void;
    /**
     * `'best'` resolves once the tx is in a best block, with its dispatch result,
     * one finality lag (a few blocks) before `'finalized'`, the default. Read the
     * state it changed at the best block too, or it will look unchanged.
     */
    resolveAt?: 'best' | 'finalized';
    /**
     * With `resolveAt: 'best'`, called once the tx is finalized too: a best block can
     * be reorged away after resolving, so state read then may need reading again.
     */
    onFinalized?: (result: TxResult) => void;
    /**
     * With `resolveAt: 'best'`, called after resolving when the tx leaves the best chain
     * (a reorg; it may be included again) or its tracking is lost (the connection or
     * the block stream failed): read again, it may still land. Called with the error
     * only when the tx is invalid on the finalized chain (`InvalidTxError`): it will
     * not land.
     */
    onReorg?: (invalid?: unknown) => void;
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
        // `{ type: <pallet>, value: { type: <error> } }`: keep both, since the
        // error name is what a wallet classifies on (`classifyChainError`).
        const pallet = err.value as { type?: string; value?: { type?: string } } | undefined;
        if (pallet?.type) {
            const name = pallet.value?.type;
            return name ? `Module(${pallet.type}.${name})` : `Module(${pallet.type})`;
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
    const fee = feePaidFrom(payload);
    const paid = fee === null ? base : { ...base, fee };
    if (!payload.ok) {
        return { ...paid, error: formatDispatchError(payload.dispatchError) };
    }
    return paid;
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
/**
 * The fee in a `TransactionPayment.TransactionFeePaid { who, actual_fee, tip }` event's
 * data, as decimal text: by name (`actual_fee`, or `actualFee` from camelCasing
 * tooling) or by position. Null when absent.
 */
export function transactionFeePaid(data: unknown): string | null {
    const plain =
        data !== null && typeof data === 'object' && 'toJSON' in data
            ? (data as { toJSON(): unknown }).toJSON()
            : data;
    if (!plain || typeof plain !== 'object') return null;
    const fee = Array.isArray(plain)
        ? plain[1]
        : ((plain as Record<string, unknown>)['actual_fee'] ??
          (plain as Record<string, unknown>)['actualFee'] ??
          (plain as Record<string, unknown>)['1']);
    return typeof fee === 'bigint' || typeof fee === 'number' || typeof fee === 'string'
        ? String(fee)
        : null;
}

export function feePaidFrom(payload: TxFinalizedPayload): string | null {
    const events = (payload as { events?: unknown }).events;
    if (!Array.isArray(events)) return null;
    for (const record of events) {
        const ev = record as { type?: string; value?: { type?: string; value?: unknown } };
        if (ev?.type !== 'TransactionPayment') continue;
        if (ev.value?.type !== 'TransactionFeePaid') continue;
        return transactionFeePaid(ev.value.value);
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
 *
 * Being hand-written, it can drift from PAPI without anything here noticing:
 * `callUnsafeTx` casts, so a renamed method fails at signing time rather than
 * at build time. `tests/chain/unsafeTx.types.test.ts` pins it against PAPI's
 * real `Transaction` so that drift breaks the typecheck instead.
 */
export interface UnsafeTx {
    /** The fee `creator` would pay, as polkadot-api estimates it. */
    getEstimatedFees?(creator: SubstrateSigner, options?: UnsafeTxOptions): Promise<bigint>;
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
    /** The call as PAPI decoded it: `{ type: pallet, value: { type: call, value: args } }`. */
    decodedCall: unknown;
}

export function callUnsafeTx(txEntry: unknown, ...args: unknown[]): UnsafeTx {
    return (txEntry as (...a: unknown[]) => UnsafeTx)(...args);
}

/**
 * Signs and submits, resolving on finalization, or on best-block inclusion with
 * `resolveAt: 'best'`. Refuses a shielded-pool spend (`assertNotSignedSpend`)
 * before the signer sees it.
 *
 * With `onBroadcast`, `onSigned` or `resolveAt: 'best'` the tx goes through
 * `createSubmitAndWatch`, whose event stream is the only place the mempool
 * acknowledgement and the best-block inclusion are visible; otherwise the plain
 * promise path is kept, byte-for-byte the behaviour every existing caller had.
 */
export function signAndSubmitTx(
    tx: UnsafeTx,
    signer: SubstrateSigner,
    options?: SubmitOptions
): Promise<TxResult> {
    try {
        assertNotSignedSpend(tx);
    } catch (e) {
        return Promise.reject(e);
    }
    const { onBroadcast, onSigned, resolveAt, onFinalized, onReorg, ...txOptions } = options ?? {};
    const opts = Object.keys(txOptions).length > 0 ? (txOptions as UnsafeTxOptions) : undefined;
    const atBest = resolveAt === 'best';

    if (!onBroadcast && !onSigned && !atBest) {
        return (
            opts !== undefined ? tx.createAndSubmit(signer, opts) : tx.createAndSubmit(signer)
        ).then(toTxResult);
    }

    return new Promise<TxResult>((resolve, reject) => {
        let resolved = false;
        const stream =
            opts !== undefined
                ? tx.createSubmitAndWatch(signer, opts)
                : tx.createSubmitAndWatch(signer);
        stream.subscribe({
            next(event) {
                if (event.type === 'signed')
                    onSigned?.((event as unknown as { txHash: string }).txHash);
                if (event.type === 'broadcasted') onBroadcast?.();
                // polkadot-api 3 emits `inBestBlock` / `notInBestBlock`; earlier versions
                // `txBestBlocksState` with `found`.
                const found = (event as { found?: boolean }).found;
                const inBest =
                    event.type === 'inBestBlock' ||
                    (event.type === 'txBestBlocksState' && found === true);
                const leftBest =
                    event.type === 'notInBestBlock' ||
                    (event.type === 'txBestBlocksState' && found === false);
                if (resolved && atBest && leftBest) onReorg?.();
                // The first inclusion settles it; a later reorg goes to `onReorg`.
                if (!resolved && (event.type === 'finalized' || (atBest && inBest))) {
                    resolved = true;
                    resolve(toTxResult(event as unknown as TxFinalizedPayload));
                }
                if (event.type === 'finalized' && atBest) {
                    onFinalized?.(toTxResult(event as unknown as TxFinalizedPayload));
                }
            },
            error(e) {
                if (!resolved) reject(e);
                else
                    onReorg?.(
                        (e as { name?: unknown } | null)?.name === 'InvalidTxError' ? e : undefined
                    );
            },
        });
    });
}

/**
 * Submits an unsigned (bare) transaction using polkadot-api's getBareTx().
 * Used for private_transfer and unshield, which the runtime accepts only unsigned.
 */
export async function submitBareTx(
    tx: { getBareTx(): Promise<Uint8Array> },
    client: SubstrateClient,
    onBroadcast?: () => void
): Promise<TxResult> {
    // Tracked from `getBareTx` on: it reads the chain too, and a teardown there
    // fails the spend as surely as one after the broadcast.
    return client.trackTx(
        (async () => {
            const bareTx = await tx.getBareTx();
            // The unsigned path has no event stream — `submit` resolves only at
            // finalization. Firing before the await is the closest observable moment to
            // "the tx left the wallet", and matches what a signed submit reports.
            onBroadcast?.();
            const payload = await client.submitUnsignedAndWatch(bareTx);
            return toTxResult(payload);
        })()
    );
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
