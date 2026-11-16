/**
 * Retrying a request while the node answers busy; what "busy" means is
 * `protocol/rpcErrors`.
 */
import { isServerBusyError } from '../../protocol/rpcErrors';

export { isServerBusyError, SERVER_BUSY_CODE, SERVER_BUSY_TEXT } from '../../protocol/rpcErrors';

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
