/**
 * What a note IS.
 *
 * The protocol's own vocabulary: the public chain data around a note. The
 * custody-side types are not here — the note itself carries a spending key, and
 * so do build params and an opened memo. Nothing here describes an extrinsic —
 * the
 * argument shapes the pallet accepts live in `pallet/extrinsicParams.ts`,
 * because a wallet can build, decrypt and select notes without ever submitting
 * anything.
 */

/** On-chain Merkle tree state for the shielded pool. */
export type MerkleTreeInfo = {
    /** 0x-prefixed current Merkle root hex. */
    root: string;
    /** Number of leaves (commitments) inserted so far. */
    treeSize: number;
    /** Tree depth (levels from leaf to root). */
    depth: number;
};

/** A commitment surfaced by the indexer scan feed, for trial-decryption. */
export type ScanCommitment = {
    /** 0x-prefixed 32-byte commitment hex. */
    commitmentHex: string;
    /** Leaf position of the commitment in the Merkle tree. */
    leafIndex: number;
    /** 0x-prefixed encrypted memo hex, or null if none was published. */
    encryptedMemo: string | null;
};

/**
 * Circuit version notes are created under today. A note carries its own
 * `circuitVersion` so that, after a VK rotation, it is always proven and
 * verified against the circuit that created it. Only one version exists today;
 * callers may pass the chain's active version explicitly.
 */
export const CURRENT_CIRCUIT_VERSION = 1;

/**
 * What a sender can still say about a note they sent, using only public data.
 *
 * No decryption and no key: the memo travels verbatim, exactly as published.
 * The point is to FORWARD it to the recipient inside a fresh payment slip, not
 * to read it — the recipient opens it with their own viewing key as always.
 *
 * That is what makes a slip recoverable after a lost device. What is NOT
 * recoverable this way is the amount and the recipient, which live inside the
 * sealed memo: a sender restoring from a seed alone gets working slips, not
 * their outgoing history.
 */
export type NoteFacts = {
    /** 0x-prefixed 32-byte LE commitment hex of the recipient output. */
    commitmentHex: string;
    /** Global Merkle leaf index, when known. */
    leafIndex?: number;
    /**
     * The note's 180-byte encrypted memo, 0x-prefixed, exactly as published.
     *
     * Carried verbatim, never decrypted here — the sender has no key for it.
     * Handing it back to the recipient inside a fresh slip is what re-issuing a
     * slip means.
     */
    encryptedMemo: string;
};
