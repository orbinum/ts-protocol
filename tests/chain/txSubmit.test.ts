/**
 * signAndSubmitTx / submitBareTx — the submit paths and their broadcast hook.
 *
 * The property that matters: `onBroadcast` fires at mempool acknowledgement and
 * the RESULT still resolves at finalization. A wallet UI flips to "submitted" on
 * the first and records the block on the second; collapsing them would either
 * freeze the UI until finality or report a block that does not exist yet.
 */
import { describe, it, expect, vi } from 'vitest';
import { signAndSubmitTx, submitBareTx, feePaidFrom } from '../../src/chain/tx';
import type { UnsafeTx } from '../../src/chain/tx';
import type { SignerTxCreator as SubstrateSigner } from 'polkadot-api/tx-creator';
import type { SubstrateClient } from '../../src/chain/substrate/SubstrateClient';

const SIGNER = {} as SubstrateSigner;

const FINALIZED = {
    type: 'finalized',
    txHash: '0xabc',
    block: { hash: '0xblock', number: 7 },
    ok: true,
};

/** A tx whose watch stream replays `events` in order; createAndSubmit resolves directly. */
function fakeTx(events: Array<Record<string, unknown>> = [{ ...FINALIZED }], failure?: unknown) {
    const createAndSubmit = vi.fn().mockResolvedValue(FINALIZED);
    const createSubmitAndWatch = vi.fn().mockReturnValue({
        subscribe(observer: { next(e: unknown): void; error(e: unknown): void }) {
            for (const event of events) observer.next(event);
            if (failure !== undefined) observer.error(failure);
            return {};
        },
    });
    return {
        tx: { createAndSubmit, createSubmitAndWatch, getBareTx: vi.fn() } as unknown as UnsafeTx,
        createAndSubmit,
        createSubmitAndWatch,
    };
}

describe('signAndSubmitTx', () => {
    it('keeps the plain promise path when no onBroadcast is given', async () => {
        // The watch stream is a behaviour change; callers that never asked for
        // the hook must stay on the code path they always had.
        const { tx, createAndSubmit, createSubmitAndWatch } = fakeTx();

        const result = await signAndSubmitTx(tx, SIGNER);

        expect(result).toMatchObject({ ok: true, txHash: '0xabc', blockNumber: 7 });
        expect(createAndSubmit).toHaveBeenCalledWith(SIGNER);
        expect(createSubmitAndWatch).not.toHaveBeenCalled();
    });

    it('fires onBroadcast at mempool acknowledgement, resolves at finalization', async () => {
        const { tx } = fakeTx([{ type: 'signed' }, { type: 'broadcasted' }, { ...FINALIZED }]);
        const seen: string[] = [];
        const onBroadcast = () => seen.push('broadcast');

        const result = await signAndSubmitTx(tx, SIGNER, { onBroadcast }).then((r) => {
            seen.push('finalized');
            return r;
        });

        expect(seen).toEqual(['broadcast', 'finalized']);
        expect(result.ok).toBe(true);
    });

    it('still resolves when the stream never emits broadcasted', async () => {
        // A node can finalize faster than it reports intermediate states; the
        // result must not depend on the hook having fired.
        const { tx } = fakeTx([{ ...FINALIZED }]);
        const onBroadcast = vi.fn();

        const result = await signAndSubmitTx(tx, SIGNER, { onBroadcast });

        expect(result.ok).toBe(true);
        expect(onBroadcast).not.toHaveBeenCalled();
    });

    it('rejects when the stream errors', async () => {
        const tx = {
            createAndSubmit: vi.fn(),
            getBareTx: vi.fn(),
            createSubmitAndWatch: () => ({
                subscribe(observer: { error(e: unknown): void }) {
                    observer.error(new Error('dropped'));
                    return {};
                },
            }),
        } as unknown as UnsafeTx;

        await expect(signAndSubmitTx(tx, SIGNER, { onBroadcast: () => {} })).rejects.toThrow(
            'dropped'
        );
    });

    it('carries a dispatch error into the result', async () => {
        const failed = {
            type: 'finalized',
            txHash: '0xabc',
            block: { hash: '0xb', number: 1 },
            ok: false,
            dispatchError: { type: 'Module', value: { type: 'ShieldedPool.InvalidProof' } },
        };
        const { tx } = fakeTx([{ type: 'broadcasted' }, failed]);

        const result = await signAndSubmitTx(tx, SIGNER, { onBroadcast: () => {} });

        expect(result.ok).toBe(false);
        expect(result.error).toContain('InvalidProof');
    });

    it('forwards remaining tx options and strips the hook', async () => {
        // PAPI would choke on an unknown `onBroadcast` field in its options.
        const { tx, createSubmitAndWatch } = fakeTx([{ ...FINALIZED }]);

        await signAndSubmitTx(tx, SIGNER, { onBroadcast: () => {}, mortality: { mortal: false } });

        expect(createSubmitAndWatch).toHaveBeenCalledWith(SIGNER, { mortality: { mortal: false } });
    });

    it("resolves at best-block inclusion with resolveAt: 'best', dispatch result included", async () => {
        const inBest = (found: boolean, ok = true) => ({
            type: 'txBestBlocksState',
            found,
            txHash: '0xabc',
            block: { hash: '0xbest', number: 5 },
            ok,
            ...(ok
                ? {}
                : { dispatchError: { type: 'Module', value: { type: 'Staking.BadTarget' } } }),
        });
        // Not yet in a block: keeps waiting. The first inclusion settles it.
        const { tx, createSubmitAndWatch } = fakeTx([
            { type: 'broadcasted' },
            inBest(false),
            inBest(true),
            { ...FINALIZED },
        ]);
        const result = await signAndSubmitTx(tx, SIGNER, { resolveAt: 'best' });
        expect(result).toMatchObject({ ok: true, blockHash: '0xbest', blockNumber: 5 });
        // The option is ours, never PAPI's.
        expect(createSubmitAndWatch).toHaveBeenCalledWith(SIGNER);

        const failed = fakeTx([inBest(true, false)]);
        const refused = await signAndSubmitTx(failed.tx, SIGNER, { resolveAt: 'best' });
        expect(refused.ok).toBe(false);
        expect(refused.error).toContain('BadTarget');
    });

    it("resolves on polkadot-api 3's inBestBlock, the event a live node emits", async () => {
        const { tx } = fakeTx([
            { type: 'broadcasted' },
            {
                type: 'inBestBlock',
                txHash: '0xabc',
                block: { hash: '0xbest', number: 5, index: 1 },
                ok: true,
                events: [],
            },
            { ...FINALIZED },
        ]);
        const result = await signAndSubmitTx(tx, SIGNER, { resolveAt: 'best' });
        expect(result).toMatchObject({ ok: true, blockHash: '0xbest', blockNumber: 5 });
    });

    it('with resolveAt best, reports finalization too, after resolving', async () => {
        const seen: string[] = [];
        const { tx } = fakeTx([
            {
                type: 'txBestBlocksState',
                found: true,
                txHash: '0xabc',
                block: { hash: '0xbest', number: 5 },
                ok: true,
            },
            { ...FINALIZED },
        ]);
        const result = await signAndSubmitTx(tx, SIGNER, {
            resolveAt: 'best',
            onFinalized: (r) => seen.push(`finalized #${r.blockNumber}`),
        });
        expect(result.blockNumber).toBe(5);
        expect(seen).toEqual(['finalized #7']);
    });

    it('with resolveAt best, reports the tx leaving the best chain, lost or invalid', async () => {
        const inBest = {
            type: 'inBestBlock',
            txHash: '0xabc',
            block: { hash: '0xbest', number: 5, index: 1 },
            ok: true,
            events: [],
        };
        const seen: unknown[] = [];
        const reorged = fakeTx([inBest, { type: 'notInBestBlock', txHash: '0xabc' }, inBest]);
        await signAndSubmitTx(reorged.tx, SIGNER, {
            resolveAt: 'best',
            onReorg: (e) => seen.push(e ?? 'left'),
        });
        expect(seen).toEqual(['left']);

        // Invalid on the finalized chain: it will not land, so the error is passed.
        const invalid = Object.assign(new Error('Stale'), { name: 'InvalidTxError' });
        const dropped = fakeTx([inBest], invalid);
        const result = await signAndSubmitTx(dropped.tx, SIGNER, {
            resolveAt: 'best',
            onReorg: (e) => seen.push(e ?? 'unknown'),
        });
        expect(result.blockNumber).toBe(5);
        // Tracking lost (a stream failure): it may still land, so no error is passed.
        const lost = fakeTx([inBest], new Error('BlockNotPinnedError'));
        await signAndSubmitTx(lost.tx, SIGNER, {
            resolveAt: 'best',
            onReorg: (e) => seen.push(e ?? 'unknown'),
        });
        expect(seen).toEqual(['left', invalid, 'unknown']);
    });

    it('ignores the best block without resolveAt', async () => {
        const { tx } = fakeTx([
            {
                type: 'txBestBlocksState',
                found: true,
                txHash: '0xabc',
                block: { hash: '0xbest', number: 5 },
                ok: true,
            },
            { ...FINALIZED },
        ]);
        const result = await signAndSubmitTx(tx, SIGNER, { onBroadcast: () => {} });
        expect(result.blockNumber).toBe(7);
    });
});

describe('submitBareTx', () => {
    it('fires onBroadcast before awaiting finalization', async () => {
        // The unsigned path has no event stream, so "before the await" is the
        // closest observable moment to the tx leaving the wallet.
        const seen: string[] = [];
        const client = {
            submitUnsignedAndWatch: async () => {
                seen.push('submitted');
                return FINALIZED;
            },
        } as unknown as SubstrateClient;
        const tx = { getBareTx: async () => new Uint8Array([1]) };

        const result = await submitBareTx(tx, client, () => seen.push('broadcast'));

        expect(seen).toEqual(['broadcast', 'submitted']);
        expect(result.ok).toBe(true);
    });
});

/**
 * feePaidFrom — the fee a signed extrinsic actually paid.
 *
 * It exists only in the finalized block's events: the charge depends on the
 * extrinsic's real weight and the block's congestion, so it is not knowable
 * before submission and is not carried on the transaction. A caller that does
 * not read it here has no second chance, which is how substrate-signed
 * operations ended up displaying a blank fee.
 */
describe('feePaidFrom', () => {
    const withEvents = (events: unknown[]) =>
        ({
            txHash: '0xabc',
            block: { hash: '0xblock', number: 7 },
            ok: true,
            events,
        }) as never;

    const FEE_EVENT = {
        type: 'TransactionPayment',
        value: { type: 'TransactionFeePaid', value: { actual_fee: 4954577217n } },
    };

    it('reads actual_fee out of TransactionFeePaid', () => {
        // The figure is from a real dev-chain shield, so the magnitude is honest:
        // a few billion planck, far below what six-digit formatting can show.
        expect(feePaidFrom(withEvents([FEE_EVENT]))).toBe('4954577217');
    });

    it('finds the event among the others a block carries', () => {
        expect(
            feePaidFrom(
                withEvents([
                    { type: 'Balances', value: { type: 'Withdraw', value: {} } },
                    { type: 'ShieldedPool', value: { type: 'Shielded', value: {} } },
                    FEE_EVENT,
                    { type: 'System', value: { type: 'ExtrinsicSuccess', value: {} } },
                ])
            )
        ).toBe('4954577217');
    });

    // Null, never '0': an unsigned (gasless) extrinsic pays no fee and emits no
    // such event, and a zero would assert the operation was free rather than
    // admitting the cost is unknown.
    it('returns null when no fee was paid', () => {
        expect(feePaidFrom(withEvents([]))).toBeNull();
        expect(
            feePaidFrom(withEvents([{ type: 'Balances', value: { type: 'Withdraw', value: {} } }]))
        ).toBeNull();
    });

    it('returns null rather than guessing when the payload carries no events', () => {
        expect(
            feePaidFrom({ txHash: '0xabc', block: { hash: '0x', number: 1 }, ok: true } as never)
        ).toBeNull();
    });
});
