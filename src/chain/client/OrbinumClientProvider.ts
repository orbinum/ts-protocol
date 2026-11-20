/**
 * Keeping a chain connection alive across the things that break one.
 *
 * A tab sleeps and its timers are throttled; a phone changes network; a node
 * restarts mid-proof. `OrbinumClient` on its own gives no signal for any of
 * that — requests simply start failing. This wraps one and turns those into a
 * status a UI can render, plus reconnection that backs off instead of hammering
 * a node that is already struggling.
 *
 * Two behaviours here exist because of how Orbinum spends specifically: probes
 * time out while the node verifies a ZK proof, and a connection that flaps must
 * not reset its backoff on every brief success. Both are documented where they
 * are implemented.
 */
import { OrbinumClient } from './OrbinumClient';
import type { MetadataCache } from '../substrate/metadataCache';
import type { OrbinumClientConfig } from './types';

// ─── Connection state ─────────────────────────────────────────────────────────

/** Lifecycle state of the provider's underlying `OrbinumClient` connection. */
export type ConnectionStatus =
    | 'idle' // Not yet connected; `connect()` has not been called.
    | 'connecting' // Initial connection attempt in progress.
    | 'connected' // Client is live and heartbeat is running.
    | 'disconnected' // Connection lost; reconnect will be scheduled automatically.
    | 'reconnecting'; // Waiting for the next reconnect attempt (exponential backoff).

/** What a `StatusListener` receives on each transition. */
export type StatusChangeEvent = {
    status: ConnectionStatus;
    /** Why the connection dropped. Only on `'disconnected'`. */
    error?: string;
    /**
     * Only on `'connected'`, and only when the status did not change: the
     * socket under the live client reopened. PAPI reconnects on its own after
     * a drop too short for the heartbeat to notice, so this is the one sign of
     * it. The node may have restarted in between, possibly on another build:
     * whatever a host checked about the node on connect, it checks again here.
     */
    resumed?: true;
};

export type StatusListener = (event: StatusChangeEvent) => void;

/**
 * Connection tuning. Every field has a default; override them for a network
 * whose latency or stability differs from a normal browser-to-node link.
 */
export interface ClientProviderConfig {
    /** WebSocket URL of the Orbinum Substrate node (e.g. `"ws://localhost:9944"`). */
    substrateWs: string;
    /** HTTP URL of the EVM JSON-RPC endpoint (e.g. `"http://localhost:9933"`). Omit to disable EVM support. */
    evmRpc?: string;
    /** HTTP URL of a second EVM endpoint, used only to detect transactions stranded on `evmRpc`. */
    evmRpcPeer?: string;
    /** Timeout for the initial WebSocket handshake in milliseconds. Default: `8_000`. */
    connectTimeoutMs?: number;
    /**
     * Where each connection keeps the runtime metadata, by code hash, so it is not
     * downloaded (hundreds of KB) on every connect. See `MetadataCache`.
     */
    metadataCache?: MetadataCache;
    /** Interval between heartbeat probes in milliseconds. Default: `5_000`. */
    heartbeatIntervalMs?: number;
    /** Maximum time to wait for a heartbeat response before treating the node as unreachable. Default: `4_000`. */
    heartbeatTimeoutMs?: number;
    /** Initial reconnect delay in milliseconds (doubles on each failure). Default: `3_000`. */
    reconnectBaseMs?: number;
    /** Maximum reconnect delay cap in milliseconds. Default: `30_000`. */
    reconnectMaxMs?: number;
    /**
     * How long a connection must stay live before the reconnect backoff is reset
     * to base, in milliseconds. Prevents a flapping node (connect → drop →
     * connect) from resetting the backoff on every brief connect and hammering
     * the node every `reconnectBaseMs`. Default: `10_000`.
     */
    stableAfterMs?: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONNECT_TIMEOUT_MS = 8_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 4_000;
const DEFAULT_RECONNECT_BASE_MS = 3_000;
const DEFAULT_RECONNECT_MAX_MS = 30_000;
const DEFAULT_STABLE_AFTER_MS = 10_000;

/**
 * Manages the lifecycle of an `OrbinumClient` with heartbeat monitoring,
 * exponential-backoff reconnection, and status event emission.
 *
 * Instantiate one per application and use as a singleton.
 *
 * @example
 * ```ts
 * import { OrbinumClientProvider } from '@orbinum/protocol';
 *
 * const provider = new OrbinumClientProvider({
 *   substrateWs: 'ws://localhost:9944',
 *   evmRpc: 'http://localhost:9944',
 * });
 * provider.connect();
 *
 * const client = await provider.getOrbinumClient();
 * ```
 */
/**
 * What a caller awaiting a connection gets when `reset()` overtook it: ask for the client
 * again (a new provider, or this one once it reconnects) rather than reporting a failure.
 */
export class ConnectionSupersededError extends Error {
    constructor() {
        super('Connection attempt superseded by reset()');
        this.name = 'ConnectionSupersededError';
    }
}

export class OrbinumClientProvider {
    private readonly config: ClientProviderConfig;
    private readonly connectTimeoutMs: number;
    private readonly heartbeatIntervalMs: number;
    private readonly heartbeatTimeoutMs: number;
    private readonly reconnectBaseMs: number;
    private readonly reconnectMaxMs: number;
    private readonly stableAfterMs: number;

    // ─── State ──────────────────────────────────────────────────────────────
    private _status: ConnectionStatus = 'idle';
    private _orbinumClient: OrbinumClient | null = null;
    /** In-flight attempt, so concurrent callers await one connect rather than racing several. */
    private _connectingPromise: Promise<OrbinumClient> | null = null;
    /**
     * Bumped by `reset()`: an attempt started before it is stale when it lands, and its
     * client is destroyed instead of adopted — or a reset provider would come back
     * `connected` with a client nobody asked for, beside the one a fresh caller opens.
     */
    private _generation = 0;

    // ─── Timers ─────────────────────────────────────────────────────────────
    // Typed as `ReturnType<typeof …>` rather than `number` or `NodeJS.Timeout`:
    // the two environments disagree, and naming either breaks the other.
    private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private _stableTimer: ReturnType<typeof setTimeout> | null = null;
    /** Backoff exponent. Reset only once a connection proves stable. */
    private _reconnectAttempt = 0;
    /** Consecutive failed probes, against the thresholds below. */
    private _probeFailures = 0;

    // ─── Events ─────────────────────────────────────────────────────────────
    private _listeners: Set<StatusListener> = new Set();

    /** Does not connect — call `connect()`. */
    constructor(config: ClientProviderConfig) {
        this.config = config;
        this.connectTimeoutMs = config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
        this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
        this.heartbeatTimeoutMs = config.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
        this.reconnectBaseMs = config.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
        this.reconnectMaxMs = config.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
        this.stableAfterMs = config.stableAfterMs ?? DEFAULT_STABLE_AFTER_MS;
    }

    // ─── Status ─────────────────────────────────────────────────────────────

    /** Current connection status. */
    get status(): ConnectionStatus {
        return this._status;
    }

    /**
     * Notifies listeners of a transition.
     *
     * A throwing listener is swallowed: listeners are host code (a store write,
     * a toast), and one of them failing must not stop the others from learning
     * the connection dropped.
     */
    private setStatus(status: ConnectionStatus, error?: string): void {
        this._status = status;
        this.emit({ status, ...(error ? { error } : {}) });
    }

    private emit(event: StatusChangeEvent): void {
        this._listeners.forEach((fn) => {
            try {
                fn(event);
            } catch {
                /* listener errors must not break the provider */
            }
        });
    }

    /** Subscribes to status transitions. Returns the unsubscribe function. */
    onStatusChange(listener: StatusListener): () => void {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    /**
     * Starts connecting. No-op unless the provider is `'idle'`, so calling it
     * twice cannot open a second connection alongside the first.
     */
    connect(): void {
        if (this._status !== 'idle') return;
        this.startConnectAttempt();
    }

    /** Returns to `'idle'`, dropping the client, any pending reconnect and any attempt in flight. */
    reset(): void {
        this._generation++;
        this.cancelReconnect();
        this.teardownClient();
        this._reconnectAttempt = 0;
        this.setStatus('idle');
    }

    // ─── Internal connection flow ───────────────────────────────────────────

    /** One attempt, with a scheduled retry if it fails. */
    private startConnectAttempt(): void {
        const generation = this._generation;
        // The attempt is in place before listeners hear `connecting`: one that asks for
        // the client right then awaits this attempt instead of finding none.
        this._connectingPromise = this.attemptConnect(generation);
        this._connectingPromise.catch(() => {
            if (generation === this._generation && this._status !== 'idle')
                this.scheduleReconnect();
        });
        this.setStatus('connecting');
    }

    /**
     * Connects, racing `connectTimeoutMs`.
     *
     * Most of the code below is about the loser of that race. A connect that
     * times out is not cancelled — PAPI keeps trying, and if it eventually
     * succeeds the resulting client belongs to nobody and reconnects forever in
     * the background. So both losing cases are destroyed explicitly: the client
     * that arrived just as the timeout fired (`orphanClient`), and the one that
     * arrives afterwards (the `clientPromise` continuation).
     */
    private async attemptConnect(generation: number): Promise<OrbinumClient> {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let orphanClient: OrbinumClient | null = null;

        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
                () =>
                    reject(
                        new Error(
                            `Node unavailable — could not connect to ${this.config.substrateWs} within ${this.connectTimeoutMs / 1000}s`
                        )
                    ),
                this.connectTimeoutMs
            );
        });

        let clientPromise: Promise<OrbinumClient> | null = null;
        let own: OrbinumClient | null = null;
        try {
            const connectConfig: OrbinumClientConfig = {
                substrateWs: this.config.substrateWs,
                connectTimeoutMs: this.connectTimeoutMs,
            };
            if (this.config.evmRpc) connectConfig.evmRpc = this.config.evmRpc;
            if (this.config.evmRpcPeer) connectConfig.evmRpcPeer = this.config.evmRpcPeer;
            if (this.config.metadataCache) connectConfig.metadataCache = this.config.metadataCache;
            // Only the live client's socket speaks: not one a reset, a timeout
            // or a reconnect has since replaced.
            connectConfig.onSocketReopen = () => {
                if (own && this._orbinumClient === own && this._status === 'connected')
                    this.emit({ status: 'connected', resumed: true });
            };
            clientPromise = OrbinumClient.connect(connectConfig);
            const client = await Promise.race([clientPromise, timeoutPromise]);
            orphanClient = client;

            clearTimeout(timeoutId!);
            // Reset while connecting: this attempt is no one's any more.
            if (generation !== this._generation) throw new ConnectionSupersededError();
            orphanClient = null;

            this._orbinumClient = client;
            own = client;
            this._connectingPromise = null;
            this.setStatus('connected');
            this.startHeartbeat();
            this.startStableTimer();

            return client;
        } catch (err) {
            clearTimeout(timeoutId!);
            if (orphanClient) {
                try {
                    orphanClient.destroy();
                } catch {
                    /* ignore */
                }
            } else if (clientPromise) {
                clientPromise.then(
                    (c) => {
                        try {
                            c.destroy();
                        } catch {
                            /* ignore */
                        }
                    },
                    () => {
                        /* inner connect failed and cleaned up after itself */
                    }
                );
            }
            // A stale attempt (reset while it ran, timed out or not) leaves the provider
            // as `reset()` or a newer attempt set it.
            if (err instanceof ConnectionSupersededError || generation !== this._generation)
                throw err;
            this._connectingPromise = null;
            this.setStatus(
                'disconnected',
                err instanceof Error ? err.message : 'Connection failed'
            );
            throw err;
        }
    }

    // ─── Heartbeat ──────────────────────────────────────────────────────────

    /**
     * Consecutive failed probes required before the client is torn down. A
     * single missed probe is routine (throttled background tab, node busy
     * verifying a ZK proof, transient network blip) — destroying the client on
     * it rejects every in-flight request with "Client destroyed" even though
     * the tx may still land on-chain.
     */
    private static readonly PROBE_FAILURE_THRESHOLD = 2;
    /**
     * With a tx awaiting finalization, tolerate more missed probes: an unsigned
     * private_transfer/unshield makes the node CPU-bound on proof verification,
     * which is exactly when probes time out — tearing down then kills the very
     * tx being processed.
     */
    private static readonly PROBE_FAILURE_THRESHOLD_INFLIGHT = 6;

    /** Replaces any running heartbeat, so a reconnect never leaves two probing. */
    private startHeartbeat(): void {
        this.stopHeartbeat();
        this._probeFailures = 0;
        this._heartbeatTimer = setInterval(async () => {
            const client = this._orbinumClient;
            if (this._status !== 'connected' || !client) return;
            const alive = await this.probe();
            // A probe of a client torn down meanwhile says nothing of the current one.
            if (this._status !== 'connected' || this._orbinumClient !== client) return;
            if (alive) {
                this._probeFailures = 0;
                return;
            }
            this._probeFailures++;
            const threshold = this._orbinumClient?.substrate.hasInflightTx
                ? OrbinumClientProvider.PROBE_FAILURE_THRESHOLD_INFLIGHT
                : OrbinumClientProvider.PROBE_FAILURE_THRESHOLD;
            if (this._probeFailures >= threshold) {
                this.setStatus('disconnected', 'Node is unreachable');
                this.teardownClient();
                this.scheduleReconnect();
            }
        }, this.heartbeatIntervalMs);
    }

    private stopHeartbeat(): void {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }

    /**
     * One liveness check: `system_health`, bounded by `heartbeatTimeoutMs`.
     *
     * Never throws — a probe that failed is an answer, not an error, and the
     * caller counts failures rather than handling them.
     */
    private async probe(): Promise<boolean> {
        if (!this._orbinumClient) return false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([
                this._orbinumClient.substrate.request('system_health', []),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('timeout')), this.heartbeatTimeoutMs);
                }),
            ]);
            return true;
        } catch {
            return false;
        } finally {
            clearTimeout(timer);
        }
    }

    // ─── Connection stability ───────────────────────────────────────────────

    /**
     * After a successful connect, wait `stableAfterMs` before resetting the
     * backoff. If the connection survives that long it's considered stable and
     * the next drop starts from base delay again; if it drops sooner the backoff
     * keeps growing, so a flapping node backs off instead of hammering.
     */
    private startStableTimer(): void {
        this.stopStableTimer();
        this._stableTimer = setTimeout(() => {
            this._stableTimer = null;
            if (this._status === 'connected') this._reconnectAttempt = 0;
        }, this.stableAfterMs);
    }

    private stopStableTimer(): void {
        if (this._stableTimer) {
            clearTimeout(this._stableTimer);
            this._stableTimer = null;
        }
    }

    // ─── Reconnection ───────────────────────────────────────────────────────

    /**
     * Schedules the next connection attempt using exponential backoff
     * (capped at `reconnectMaxMs`) with EQUAL jitter, then transitions to
     * `'reconnecting'`.
     *
     * The delay lands in `[capped/2, capped]` — half fixed, half random. That
     * spreads a shared outage's reconnects over a `capped/2` window instead of
     * having every client retry in lockstep, while keeping a floor so the first
     * attempts do not all pile up near zero the way full jitter allows.
     */
    private scheduleReconnect(): void {
        if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
        const capped = Math.min(
            this.reconnectBaseMs * 2 ** this._reconnectAttempt,
            this.reconnectMaxMs
        );
        const delay = capped / 2 + Math.random() * (capped / 2);
        this._reconnectAttempt++;
        this.setStatus('reconnecting');
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (this._status !== 'idle') this.startConnectAttempt();
        }, delay);
    }

    private cancelReconnect(): void {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }

    // ─── Client teardown ────────────────────────────────────────────────────

    /** Drops the client and every timer that assumed it was alive. */
    private teardownClient(): void {
        this.stopHeartbeat();
        this.stopStableTimer();
        try {
            this._orbinumClient?.destroy();
        } catch {
            /* ignore */
        }
        this._orbinumClient = null;
        this._connectingPromise = null;
    }

    // ─── Client access ──────────────────────────────────────────────────────

    /**
     * The live client, or the in-flight attempt to get one.
     *
     * Throws when there is neither. Deliberately not "wait until connected":
     * during a backoff that wait could be 30 seconds, and a caller blocked that
     * long has no way to tell a slow connection from a dead one.
     */
    async getOrbinumClient(): Promise<OrbinumClient> {
        if (this._orbinumClient) return this._orbinumClient;
        if (this._connectingPromise) return this._connectingPromise;
        throw new Error(`OrbinumClientProvider: cannot get client in status '${this._status}'`);
    }

    /** `getOrbinumClient()` for callers where no connection is a no-op, not an error. */
    async tryGetOrbinumClient(): Promise<OrbinumClient | null> {
        try {
            return await this.getOrbinumClient();
        } catch {
            return null;
        }
    }

    // ─── Convenience RPC helpers ────────────────────────────────────────────

    /** A Substrate JSON-RPC call, once a client is available. */
    async rpcSend<T>(method: string, params: unknown[] = []): Promise<T> {
        const client = await this.getOrbinumClient();
        return client.substrate.request<T>(method, params);
    }

    /** Several Substrate calls in one HTTP round trip. Results keep the input order. */
    async rpcBatch<T extends unknown[]>(
        calls: Array<{ method: string; params?: unknown[] }>
    ): Promise<T> {
        const client = await this.getOrbinumClient();
        return client.substrate.batchRequest<T>(calls);
    }

    /** An EVM JSON-RPC call. Throws when `evmRpc` was not configured. */
    async evmRpc<T>(method: string, params: unknown[] = []): Promise<T> {
        const client = await this.getOrbinumClient();
        if (!client.evm) throw new Error('EVM RPC not configured');
        return client.evm.request<T>(method, params);
    }

    /** Several EVM calls in one batch. Results keep the input order. */
    async evmRpcBatch<T extends unknown[]>(
        calls: Array<{ method: string; params?: unknown[] }>
    ): Promise<T> {
        const client = await this.getOrbinumClient();
        if (!client.evm) throw new Error('EVM RPC not configured');
        return client.evm.batchRequest<T>(calls);
    }
}
