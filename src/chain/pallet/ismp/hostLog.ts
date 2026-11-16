/**
 * What an EVM chain's ISMP host logs when it handles a request from Orbinum:
 * `PostRequestHandled(bytes32 commitment, address relayer)`, the commitment indexed.
 * Fetching the logs is the host's (its own RPC and limits); reading one is shared.
 */
import { Keccak256 } from '@polkadot-api/substrate-bindings';
import { toHex } from '../../../foundation/encoding/hex';

/**
 * `keccak256("PostRequestHandled(bytes32,address)")`: topic 0 of a delivery. Derived,
 * not pasted: a typo in a 32-byte constant would read as "never delivered".
 */
export const POST_REQUEST_HANDLED_TOPIC = toHex(
    Keccak256(new TextEncoder().encode('PostRequestHandled(bytes32,address)'))
);

/**
 * The relayer of a `PostRequestHandled` log: the address right-aligned in its single
 * 32-byte data word, lowercase. Null when the word is missing (a wrong address stored
 * confidently is worse than none).
 */
export function postRequestHandledRelayer(data: string): string | null {
    const body = data.startsWith('0x') ? data.slice(2) : data;
    if (body.length < 64 || !/^[0-9a-fA-F]+$/.test(body)) return null;
    return `0x${body.slice(24, 64).toLowerCase()}`;
}
