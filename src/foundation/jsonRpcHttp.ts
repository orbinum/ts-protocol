/**
 * Minimal JSON-RPC 2.0 over HTTP — batch transport.
 *
 * Substrate and EVM nodes both serve JSON-RPC over HTTP. PAPI's WebSocket
 * transport (used by `SubstrateClient` for everything else) does not expose
 * batch requests, so high-throughput callers (e.g. indexer backfill) use this
 * to fetch many results in a single round-trip instead of N.
 */

/** A single JSON-RPC call: method name plus positional params. */
export interface JsonRpcCall {
    method: string;
    params?: unknown[];
}

/** Shape of a single JSON-RPC 2.0 response object. */
interface JsonRpcResponse<T> {
    jsonrpc: '2.0';
    id: number;
    result?: T;
    error?: { code: number; message: string };
}

/** Tuning for batch retry behavior. */
export interface BatchOptions {
    /** Max retries on a retryable HTTP status (429/503). Default: 5. */
    maxRetries?: number;
    /** Base backoff in ms; doubles each attempt, capped at `maxBackoffMs`. Default: 250. */
    baseBackoffMs?: number;
    /** Backoff cap in ms, server `Retry-After` included. Default: 4000. */
    maxBackoffMs?: number;
    /** Per-attempt timeout in ms; a node that never answers fails instead of hanging. Default: 30000. */
    timeoutMs?: number;
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_BACKOFF_MS = 250;
const DEFAULT_MAX_BACKOFF_MS = 4000;
const DEFAULT_TIMEOUT_MS = 30_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POSTs a JSON payload, retrying on 429/503 with exponential backoff and
 * honoring `Retry-After` up to `maxBackoffMs`: the server picks the delay, so
 * an uncapped one lets it stall the client for as long as it likes. Returns
 * the first non-retryable response (ok or not) — HTTP-status handling stays
 * with the caller.
 */
export async function postJsonWithRetry(
    httpUrl: string,
    payload: string,
    options: BatchOptions = {}
): Promise<Response> {
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const baseBackoffMs = options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
    const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let attempt = 0;
    for (;;) {
        const res = await fetch(httpUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            signal: AbortSignal.timeout(timeoutMs),
        });

        const retryable = res.status === 429 || res.status === 503;
        if (!retryable || attempt >= maxRetries) return res;

        const retryAfter = Number(res.headers.get('retry-after'));
        const delayMs =
            Number.isFinite(retryAfter) && retryAfter > 0
                ? retryAfter * 1000
                : baseBackoffMs * 2 ** attempt;
        await sleep(Math.min(delayMs, maxBackoffMs));
        attempt++;
    }
}

/**
 * Sends `calls` as a single JSON-RPC 2.0 batch to `httpUrl`. Returns the results
 * in the same order as `calls`; a `null`/missing/per-call-error result maps to
 * `null` in that slot. Retries on 429/503 with exponential backoff (honoring
 * `Retry-After`) — public RPC nodes rate-limit bursty batches, so a serious
 * client backs off rather than dropping the window. Rejects only on a
 * non-retryable HTTP failure or after exhausting retries.
 */
export async function jsonRpcBatch<T extends unknown[]>(
    httpUrl: string,
    calls: JsonRpcCall[],
    options: BatchOptions = {}
): Promise<T> {
    if (calls.length === 0) return [] as unknown as T;

    const body = calls.map((c, i) => ({
        id: i,
        jsonrpc: '2.0',
        method: c.method,
        params: c.params ?? [],
    }));

    const res = await postJsonWithRetry(httpUrl, JSON.stringify(body), options);
    if (!res.ok) throw new Error(`JSON-RPC HTTP ${res.status}: ${res.statusText}`);

    return batchResults<T>(
        await res.json(),
        calls.map((_, i) => i)
    );
}

/**
 * The results of a batch response, in the order of `ids`.
 *
 * Reindexed by id, not sorted: JSON-RPC does not guarantee response order,
 * allows a server to omit a response, and gives a parse error `id: null` —
 * sorting would pack the survivors together and every later result would
 * answer the wrong call, silently. A missing or failed call is `null` in its
 * own slot. A body that is not an array is refused: the server answered
 * something other than the batch.
 */
export function batchResults<T extends unknown[]>(body: unknown, ids: readonly number[]): T {
    if (!Array.isArray(body)) throw new Error('JSON-RPC batch: expected an array response');
    const byId = new Map(
        (body as Array<JsonRpcResponse<unknown> | null>).map((r) => [r?.id, r] as const)
    );
    return ids.map((id) => byId.get(id)?.result ?? null) as T;
}

/** Derives the HTTP(S) RPC URL from a WebSocket URL (`ws://`→`http://`, `wss://`→`https://`). */
export function wsUrlToHttp(wsUrl: string): string {
    if (wsUrl.startsWith('wss://')) return 'https://' + wsUrl.slice('wss://'.length);
    if (wsUrl.startsWith('ws://')) return 'http://' + wsUrl.slice('ws://'.length);
    return wsUrl;
}
