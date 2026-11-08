/** The note commitment, as note.circom's NoteCommitment computes it. */
import { poseidon4 } from 'poseidon-lite';

/** `Poseidon4(value, assetId, ownerPk, blinding)`. */
export function noteCommitment(
    value: bigint,
    assetId: bigint,
    ownerPk: bigint,
    blinding: bigint
): bigint {
    return poseidon4([value, assetId, ownerPk, blinding]);
}
