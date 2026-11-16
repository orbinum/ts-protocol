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
