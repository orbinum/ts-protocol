import { createClient, Binary, type PolkadotClient, type TxFinalizedPayload } from 'polkadot-api';
import type { SignerTxCreator as SubstrateSigner } from 'polkadot-api/tx-creator';
import { getWsProvider } from 'polkadot-api/ws';
import { fromHex } from '../../foundation/encoding/hex';
import { jsonRpcBatch, wsUrlToHttp, type JsonRpcCall } from '../../foundation/jsonRpcHttp';
import type { ChainInfo, SystemHealth, EventRecord, RawBlockHeader, BlockInfo } from './types';
import type { RawRuntimeVersion } from './types/raw';
import { RuntimeDecoders, type DynamicBuilder, type ExtrinsicDecoder } from './runtimeDecoders';
import { toEventRecords } from './eventRecords';
import { extractAuthorFromLogs, timestampFromExtrinsics } from './blockInfo';

export type { DynamicBuilder, ExtrinsicDecoder } from './runtimeDecoders';

/**
 * Thin wrapper over polkadot-api (PAPI) that provides:
 * - Raw JSON-RPC calls (custom Orbinum RPCs)
 * - Block and event reads, decoded under each block's runtime (`RuntimeDecoders`)
 * - Unsafe transaction building from call data
 * - Transaction submission with or without watching
 */
export class SubstrateClient {
    private constructor(
        private readonly _papi: PolkadotClient,
        /**
         * HTTP endpoint for `batchRequest`, derived from the WS URL. Absent when
         * the PAPI client was adopted rather than opened here — the caller's
         * transport may not be a WebSocket at all, and there is nothing to
         * derive it from.
         */
        private readonly _httpUrl: string | null,
        /**
         * Whether this instance opened the PAPI client. An adopted one belongs
         * to the caller: `destroy()` must not close a connection the rest of
         * their application is still using.
         */
        private readonly _owned: boolean
    ) {}

    private readonly _decoders = new RuntimeDecoders(
        (method, params) => this.request(method, params),
        () => this._papi.getMetadata('best')
    );
    private _inflightTxCount = 0;

    /**
     * `true` while any submitted transaction is still waiting for finalization.
     * Connection managers use this to defer destroying the client — killing the
     * WS mid-submit rejects the pending tx with "Client destroyed" even though
     * it may still land on-chain.
     *
     * Only covers promise-based submits (`submit`, `submitUnsignedAndWatch`,
     * `signAndSubmit`, which wraps PAPI's `createAndSubmit`); observable-based `submitAndWatch` callers are not tracked.
     */
    get hasInflightTx(): boolean {
        return this._inflightTxCount > 0;
    }

    private async trackTx<T>(p: Promise<T>): Promise<T> {
        this._inflightTxCount++;
        try {
            return await p;
        } finally {
            this._inflightTxCount--;
        }
    }

    /**
     * Connects to the Orbinum node via WebSocket.
     * Throws if the node does not respond within `timeoutMs`.
     */
    static async connect(wsUrl: string, timeoutMs = 15_000): Promise<SubstrateClient> {
        // Keep PAPI's WebSocket heartbeat active so idle connections are not dropped
        // by intermediaries (e.g. Cloudflare). A 30s heartbeat stays well below the
        // typical idle timeout and prevents unnecessary reconnects.
        const provider = getWsProvider(wsUrl, { heartbeatTimeout: 30_000 });
        const papi = createClient(provider);

        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([
                papi._request('system_name', []),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () => reject(new Error(`Connection timeout (${timeoutMs}ms) to ${wsUrl}`)),
                        timeoutMs
                    );
                }),
            ]);
        } catch (err) {
            try {
                papi.destroy();
            } catch {
                /* ignore */
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }

        return new SubstrateClient(papi, wsUrlToHttp(wsUrl), true);
    }

    /**
     * Wraps a PAPI client the caller already has, instead of opening one.
     *
     * An application that already talks to the chain — a dApp with its own
     * connection manager, a test harness with a mock — would otherwise end up
     * with two WebSockets and two views of chain state, since `connect()`
     * constructs its provider internally. This shares the one connection.
     *
     * The adopted client is **not** owned: `destroy()` leaves it running, because
     * the rest of the application is still using it. Closing it is the caller's
     * job, as is any reconnection policy.
     *
     * @param papi    An already-connected PAPI client.
     * @param httpUrl HTTP RPC endpoint enabling `batchRequest`. Optional — that
     *                method throws without it, and nothing else needs it.
     */
    static adopt(papi: PolkadotClient, httpUrl?: string): SubstrateClient {
        return new SubstrateClient(papi, httpUrl ?? null, false);
    }

    /**
     * Performs a raw JSON-RPC request. Use this for custom Orbinum RPCs
     * (`privacy_*`, `zkVerifier_*`, `relayer_*`, etc.).
     */
    async request<T>(method: string, params: unknown[] = []): Promise<T> {
        return this._papi._request<T, unknown[]>(method, params);
    }

    /**
     * Performs multiple JSON-RPC calls in a single HTTP request (batch). Results
     * are returned in the same order as `calls`, as a typed tuple. A `null`
     * result (or per-call error) maps to `null` in that slot — the call itself
     * only rejects on HTTP/transport failure.
     *
     * Uses the HTTP RPC endpoint (derived from the WS URL); PAPI's WS transport
     * does not expose batching. Ideal for high-throughput backfill: fetch many
     * block hashes / blocks / storage reads in one round-trip instead of N.
     */
    async batchRequest<T extends unknown[]>(calls: JsonRpcCall[]): Promise<T> {
        if (!this._httpUrl) {
            throw new Error(
                'batchRequest needs an HTTP RPC endpoint; pass one to SubstrateClient.adopt()'
            );
        }
        return jsonRpcBatch<T>(this._httpUrl, calls);
    }

    /**
     * Returns basic chain information from the node.
     * Combines `system_name`, `system_chain`, `system_properties`, and `state_getRuntimeVersion`.
     */
    async getChainInfo(): Promise<ChainInfo> {
        const [chainName, version, props] = await Promise.all([
            this.request<string>('system_chain', []),
            this.request<RawRuntimeVersion>('state_getRuntimeVersion', []),
            this.request<{ tokenSymbol?: string | string[]; tokenDecimals?: number | number[] }>(
                'system_properties',
                []
            ),
        ]);

        const rawSymbol = props.tokenSymbol;
        const rawDecimals = props.tokenDecimals;

        return {
            name: chainName,
            version: String(version.specVersion),
            ss58Prefix: version.ss58Prefix ?? 42,
            symbol: Array.isArray(rawSymbol) ? (rawSymbol[0] ?? 'ORB') : (rawSymbol ?? 'ORB'),
            decimals: Array.isArray(rawDecimals) ? (rawDecimals[0] ?? 18) : (rawDecimals ?? 18),
        };
    }

    /**
     * Returns the node's peer count and sync status.
     */
    async getHealth(): Promise<SystemHealth> {
        return this.request<SystemHealth>('system_health', []);
    }

    /**
     * Returns the node's software version string.
     */
    async getNodeVersion(): Promise<string> {
        return this.request<string>('system_version', []);
    }

    /**
     * Returns the genesis hash hex.
     */
    async getGenesisHash(): Promise<string> {
        return this.request<string>('chain_getBlockHash', [0]);
    }

    /**
     * Returns the block hash for a given block number.
     * Returns null when the block does not exist or has been pruned.
     */
    async getBlockHash(blockNumber: number): Promise<string | null> {
        const hash = await this.request<string>('chain_getBlockHash', [blockNumber]);
        if (!hash || /^0x0+$/.test(hash)) return null;
        return hash;
    }

    /**
     * Fetches a block by hash or number, enriched with timestamp and block author.
     *
     * Uses `chain_getBlock` (works for all non-pruned blocks, unlike PAPI chainHead
     * which only pins recent blocks). Timestamp is read from `Timestamp.Now` storage
     * with a fallback via the `timestamp.set` extrinsic argument. Author is decoded
     * from PreRuntime digest logs using the chain's SS58 prefix.
     *
     * @param hashOrNumber - A `0x`-prefixed block hash or a block number (number or decimal string).
     * @returns `BlockInfo` or `null` if the block is not found.
     */
    async getBlock(hashOrNumber: string | number): Promise<BlockInfo | null> {
        try {
            const blockHash = await this.resolveBlockHash(hashOrNumber);
            if (!blockHash) return null;

            const raw = await this.request<{
                block: { header: RawBlockHeader; extrinsics: string[] };
            }>('chain_getBlock', [blockHash]);
            if (!raw?.block) return null;
            const { header, extrinsics } = raw.block;

            const builder = await this.getDynamicBuilder().catch(() => null);
            const ss58Prefix =
                (builder as unknown as { ss58Prefix?: number } | null)?.ss58Prefix ?? 42;
            const timestampMs =
                (builder && (await this.readTimestamp(builder, blockHash))) ||
                timestampFromExtrinsics(extrinsics);
            const author = extractAuthorFromLogs(header.digest.logs, ss58Prefix);

            return { header, extrinsics, timestampMs, author };
        } catch {
            return null;
        }
    }

    /** A block hash as given, or the hash of a block number (number or decimal string). */
    private async resolveBlockHash(hashOrNumber: string | number): Promise<string | null> {
        if (typeof hashOrNumber === 'number') return this.getBlockHash(hashOrNumber);
        return /^\d+$/.test(hashOrNumber)
            ? this.getBlockHash(parseInt(hashOrNumber, 10))
            : hashOrNumber;
    }

    /** `Timestamp.Now` at `blockHash`, or null when the read fails or is empty. */
    private async readTimestamp(
        builder: DynamicBuilder,
        blockHash: string
    ): Promise<number | null> {
        try {
            const store = builder.buildStorage('Timestamp', 'Now');
            const raw = await this.request<string | null>('state_getStorage', [
                store.keys.enc(),
                blockHash,
            ]);
            return raw ? Number(store.value.dec(fromHex(raw as `0x${string}`))) : null;
        } catch {
            return null;
        }
    }

    /**
     * Returns the underlying PolkadotClient instance.
     * Use for raw metadata access and advanced SCALE operations.
     */
    get polkadotClient(): PolkadotClient {
        return this._papi;
    }

    /**
     * Observable that emits a new entry each time a best-block is reported by the node.
     * Delegates to PAPI's `blocks$`.
     */
    get blocks$(): PolkadotClient['blocks$'] {
        return this._papi.blocks$;
    }

    /**
     * Returns the block header for a given tag or block hash.
     * Delegates to PAPI's `getBlockHeader`.
     */
    getBlockHeader(
        ...args: Parameters<PolkadotClient['getBlockHeader']>
    ): ReturnType<PolkadotClient['getBlockHeader']> {
        return this._papi.getBlockHeader(...args);
    }

    /**
     * Returns the PAPI UnsafeApi for dynamic, metadata-driven transaction building.
     * The first access triggers a metadata fetch from the node.
     *
     * Usage:
     * ```ts
     * const tx = client.unsafe.tx.shieldedPool.shield(...);
     * const result = await tx.createAndSubmit(creator);
     * ```
     */
    get unsafe() {
        return this._papi.getUnsafeApi();
    }

    /**
     * Wraps pre-built SCALE call bytes (from protocol-core TransactionBuilder)
     * into a PAPI UnsafeTransaction that can be signed and submitted.
     */
    async txFromCallData(callData: Uint8Array) {
        return this._papi.getUnsafeApi().txFromCallData(callData);
    }

    /**
     * Submits a pre-signed extrinsic (hex string) and waits for finalization.
     */
    async submit(signedHex: string): Promise<TxFinalizedPayload> {
        return this.trackTx(this._papi.submit(Binary.fromHex(signedHex)));
    }

    /**
     * Submits a pre-signed extrinsic and returns an Observable of tx lifecycle events.
     * Events: TxSigned → TxBroadcasted → TxBestBlocksState → TxFinalized
     */
    submitAndWatch(signedHex: string): ReturnType<PolkadotClient['submitAndWatch']> {
        return this._papi.submitAndWatch(Binary.fromHex(signedHex));
    }

    /**
     * Submits a bare (unsigned) extrinsic and waits for finalization.
     * Used for gasless private_transfer and unshield transactions.
     * The bare tx bytes are produced by `tx.getBareTx()` from polkadot-api.
     */
    async submitUnsignedAndWatch(bareTx: Uint8Array): Promise<TxFinalizedPayload> {
        return this.trackTx(this._papi.submit(bareTx));
    }

    /**
     * Convenience: wrap raw call bytes and sign+submit in one step.
     */
    async signAndSubmit(
        callData: Uint8Array,
        signer: SubstrateSigner
    ): Promise<TxFinalizedPayload> {
        const tx = await this.txFromCallData(callData);
        return this.trackTx(tx.createAndSubmit(signer));
    }

    /**
     * Closes the connection — but only if this instance opened it.
     *
     * A client passed to `adopt()` belongs to the caller and is left running:
     * tearing down a connection the rest of their application depends on would
     * be a surprising side effect of disposing an SDK object.
     */
    destroy(): void {
        if (this._owned) this._papi.destroy();
    }

    /**
     * Fetches and decodes all events for a given block hash.
     * Queries `System.Events` storage via SCALE codec built from on-chain metadata.
     *
     * @param blockHash - The `0x`-prefixed block hash string.
     * @returns Array of `EventRecord` or `null` if unavailable.
     */
    async queryBlockEvents(blockHash: string): Promise<EventRecord[] | null> {
        try {
            const builder = await this.getDynamicBuilder(blockHash);
            const { keys, value } = builder.buildStorage('System', 'Events');
            const raw = await this.request<string | null>('state_getStorage', [
                keys.enc(),
                blockHash,
            ]);
            if (!raw) return null;
            const decoded = value.dec(fromHex(raw as `0x${string}`));
            return toEventRecords(decoded as unknown[]);
        } catch {
            return null;
        }
    }

    // ─── Decoders ─────────────────────────────────────────────────────────────

    /**
     * The SCALE builder for the runtime at `blockHash`, or for the runtime this
     * client connected under when omitted. Decode a block with its own runtime:
     * a call or event whose shape changed in an upgrade misdecodes under another.
     */
    async getDynamicBuilder(blockHash?: string): Promise<DynamicBuilder> {
        return this._decoders.builder(blockHash);
    }

    /** The extrinsic decoder for the runtime at `blockHash`; see `getDynamicBuilder`. */
    async getExtrinsicDecoder(blockHash?: string): Promise<ExtrinsicDecoder> {
        return this._decoders.extrinsic(blockHash);
    }

    /**
     * Extracts the block author (validator/collator) from raw digest log hex
     * strings: the first 32 bytes of the PreRuntime payload, as an SS58 address.
     *
     * Can be used standalone with raw logs from `chain_getBlock` responses.
     */
    static extractAuthorFromLogs(logs: string[], ss58Prefix: number): string | null {
        return extractAuthorFromLogs(logs, ss58Prefix);
    }
}
