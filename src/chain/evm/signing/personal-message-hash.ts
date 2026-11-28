import { keccak_256 } from '@noble/hashes/sha3.js';
import { concatBytes } from '../transaction/concat-bytes';

/**
 * The EIP-191 hash `personal_sign` signs:
 * `keccak256("\x19Ethereum Signed Message:\n" ‖ len(message) ‖ message)`.
 *
 * `message` is the bytes the dapp asked to sign: `personal_sign` sends them as hex,
 * and a wallet decodes that before hashing. A string is taken as UTF-8 text.
 */
export function personalMessageHash(message: Uint8Array | string): Uint8Array {
    const encoder = new TextEncoder();
    const bytes = typeof message === 'string' ? encoder.encode(message) : message;
    const prefix = encoder.encode(`\x19Ethereum Signed Message:\n${bytes.length}`);
    return keccak_256(concatBytes([prefix, bytes]));
}
