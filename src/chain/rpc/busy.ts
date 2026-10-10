/**
 * The node refusing a request because it is momentarily full.
 *
 * The Merkle proof RPCs share a bounded queue per node; past it a request is
 * refused with JSON-RPC `-32009` (server busy). That is load, never a verdict
 * on the note: retrying shortly succeeds, and treating it as "commitment not
 * found" would purge a real note.
 */

/** JSON-RPC "server is busy". */
export const SERVER_BUSY_CODE = -32009;

/** The node's wording for a full proof queue, for errors that lost their code. */
export const SERVER_BUSY_TEXT = /merkle proof queue is full|too many merkle proofs in flight/i;

/** Whether `error` is the node refusing a request as busy. */
export function isServerBusyError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'code' in error && error.code === SERVER_BUSY_CODE) {
        return true;
    }
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    return SERVER_BUSY_TEXT.test(message);
}

/** Retry policy for {@link withBusyRetry}. */
export interface BusyRetryOptions {
    /** Tries in all, the first included. */
    attempts?: number;
    /** Wait before the first retry; doubled each time, with up to 50% jitter. */
    baseDelayMs?: number;
    /** Injected for tests. */
    sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `request`, retrying only while the node answers busy. Any other error,
 * and the last busy one, propagates unchanged.
 */
export async function withBusyRetry<T>(
    request: () => Promise<T>,
    { attempts = 4, baseDelayMs = 150, sleep = defaultSleep }: BusyRetryOptions = {}
): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await request();
        } catch (error) {
            if (attempt >= attempts || !isServerBusyError(error)) throw error;
            const delay = baseDelayMs * 2 ** (attempt - 1);
            await sleep(delay + Math.random() * delay * 0.5);
        }
    }
}
