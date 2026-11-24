/** A note's key or blinding, as a bound action carries it for the note it mints. */
import { BN254_R } from '../../../foundation/crypto/constants';
import { bytesToBigintLE } from '../../../foundation/encoding/bytes';

/** A 32-byte field element (owner key or blinding), little-endian. */
export type FieldKey = Uint8Array;

/** Throws unless `bytes` is a non-zero canonical field element, as the runtime requires of a key. */
export function assertFieldKey(bytes: FieldKey, where: string): void {
    if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
        throw new Error(`${where}: expected 32 bytes`);
    }
    const n = bytesToBigintLE(bytes);
    if (n === 0n || n >= BN254_R) throw new Error(`${where}: not a non-zero field element`);
}
