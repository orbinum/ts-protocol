/**
 * TypeScript types for pallet-shielded-pool extrinsics and supporting structures.
 *
 * Conventions:
 *   - Fixed/bounded byte arrays  → `number[]`  (SCALE-compatible)
 *   - Balances (u128)            → `bigint`
 *   - AccountId                  → `string`    (SS58 or 0x-prefixed 64-char hex)
 *   - Block numbers              → `number`
 *   - Optional fields            → `T | null`
 */

// ─── Shared primitives ────────────────────────────────────────────────────────

/**
 * 32-byte SCALE-encoded value (commitment, nullifier, Merkle root, etc.).
 * Stored as little-endian Poseidon field elements on-chain.
 */
export type Bytes32 = number[];

/**
 * 180-byte encrypted memo (ChaCha20-Poly1305 ECDH).
 * Layout: nonce(12) || ciphertext(136) || ephPk(32) = 180 bytes
 * (ciphertext = plaintext 120 + MAC 16).
 */
export type Bytes180 = number[];

/**
 * A single shield operation for use in `shield_batch`.
 */
export type ShieldOperation = {
    assetId: number;
    amount: bigint;
    /** 32-byte Poseidon commitment (LE). */
    commitment: Bytes32;
    /** Encrypted memo bytes — exactly 180 bytes. */
    encryptedMemo: number[];
    /** Shield proof. Absent from shields before spec 17. */
    proof?: number[];
    /** Shield circuit version. Absent from shields before spec 17. */
    circuitVersion?: number;
};

// ─── Extrinsic argument types ─────────────────────────────────────────────────

/**
 * Call index 0 — `shield` (Signed origin)
 * Deposits a public token amount into the shielded pool.
 */
export type ShieldArgs = {
    assetId: number;
    amount: bigint;
    /** 32-byte Poseidon commitment (LE). */
    commitment: Bytes32;
    /** Encrypted memo — exactly 180 bytes. */
    encryptedMemo: number[];
    /** Shield proof. Absent from shields before spec 17. */
    proof?: number[];
    /** Shield circuit version. Absent from shields before spec 17. */
    circuitVersion?: number;
};

/**
 * Call index 12 — `shield_batch` (Signed origin)
 * Deposits multiple notes in a single extrinsic — max 20 operations.
 */
export type ShieldBatchArgs = {
    operations: ShieldOperation[];
};

/** Input note consumed by a private transfer (SCALE wire format). */
export type RawTransferInput = {
    /** 32-byte Poseidon nullifier (LE). */
    nullifier: Bytes32;
    /** 32-byte Poseidon commitment (LE). */
    commitment: Bytes32;
};

/** Output note created by a private transfer (SCALE wire format). */
export type RawTransferOutput = {
    /** 32-byte Poseidon commitment (LE). */
    commitment: Bytes32;
    /** Encrypted memo — exactly 180 bytes. */
    memo: number[];
};

/**
 * Call index 1 — `private_transfer` (Unsigned/gasless origin)
 * Transfers value between notes without revealing sender, recipient or amount.
 * Fee is embedded in the ZK proof: input_sum == output_sum + fee.
 * The fee is paid to the block author (validator) by the pallet runtime.
 */
export type PrivateTransferArgs = {
    /** Groth16 proof bytes — max 512 bytes. */
    proof: number[];
    /** The 32-byte Merkle root (LE) each input is proven against, in input order. */
    merkleRoots: [Bytes32, Bytes32];
    nullifiers: RawTransferInput[];
    outputs: RawTransferOutput[];
    encryptedMemos: number[][];
    /** Asset ID being transferred (public input of the proof). */
    assetId: number;
    /** Gasless fee in planck. Paid to the block author (validator). */
    fee: bigint;
    /** Circuit version the input notes were created under (verified against that version's VK). */
    circuitVersion: number;
};

/**
 * Call index 2 — `unshield` (Unsigned/gasless origin)
 * Withdraws a note from the pool to a public account.
 * Fee is embedded in the ZK proof: note_value == amount + fee + changeValue.
 */
export type UnshieldArgs = {
    /** Groth16 proof bytes — max 512 bytes. */
    proof: number[];
    /** 32-byte Merkle root (LE). */
    merkleRoot: Bytes32;
    /** 32-byte nullifier of the spent note (LE). */
    nullifier: Bytes32;
    assetId: number;
    /** Net amount recipient receives (planck). */
    amount: bigint;
    /** SS58 or 0x-prefixed AccountId of the recipient. */
    recipient: string;
    /** Gasless fee in planck. */
    fee: bigint;
    /**
     * 32-byte change note commitment (LE). All zeros for total unshield.
     * Must equal NoteCommitment(changeValue, assetId, changeOwnerPk, changeBlinding)
     * when changeValue > 0 — enforced by the ZK circuit.
     */
    changeCommitment: Bytes32;
    /**
     * Encrypted memo for the change note (180 bytes, empty for total unshield).
     * Enables note recovery via blockchain scan for partial unshield.
     */
    changeEncryptedMemo?: Bytes180;
    /** Circuit version the spent note was created under (verified against that version's VK). */
    circuitVersion: number;
};

/**
 * Call index 9 — `register_asset` (Root origin)
 * Registers a new asset in the shielded pool registry.
 */
export type RegisterAssetArgs = {
    /** Asset name — max 64 bytes UTF-8. */
    name: string;
    /** Asset ticker symbol, e.g. "USDT" — max 16 bytes UTF-8. */
    symbol: string;
    /** Token decimal precision (e.g. 18 for ORB, 6 for USDT). */
    decimals: number;
    /** 20-byte EVM contract address for ERC-20 assets. Null = native asset. */
    contractAddress: number[] | null;
};

/**
 * Call index 10 — `verify_asset` (Root origin)
 * Marks a registered asset as verified, enabling shielding.
 */
export type VerifyAssetArgs = {
    assetId: number;
};

/**
 * Call index 11 — `unverify_asset` (Root origin)
 * Removes the verified status from an asset, disabling new shield operations.
 */
export type UnverifyAssetArgs = {
    assetId: number;
};

/**
 * Call index 18 — `commit_relay` (Signed origin, or a registered EVM relayer)
 * Records relay commits: a spend submitted in a later block credits its fee to
 * the relayer that committed to it, whoever submits it.
 */
export type CommitRelayArgs = {
    /** `relay_commit_hash(op_hash, relayer H160)` per spend, 32 bytes each. */
    commits: Bytes32[];
};

/**
 * Call index 19 — `claim_relay_fees` (Signed origin)
 * Pays the caller's pending relay fees out of the pool, publicly: to the
 * account of its registered relay address, else to the caller.
 */
export type ClaimRelayFeesArgs = {
    assetId: number;
    amount: bigint;
};

// ─── Discriminated call union ─────────────────────────────────────────────────

/** All pallet-shielded-pool calls as a discriminated union. */
export type ShieldedPoolCall =
    | { type: 'shield'; args: ShieldArgs }
    | { type: 'shieldBatch'; args: ShieldBatchArgs }
    | { type: 'privateTransfer'; args: PrivateTransferArgs }
    | { type: 'unshield'; args: UnshieldArgs }
    | { type: 'registerAsset'; args: RegisterAssetArgs }
    | { type: 'verifyAsset'; args: VerifyAssetArgs }
    | { type: 'unverifyAsset'; args: UnverifyAssetArgs }
    | { type: 'commitRelay'; args: CommitRelayArgs }
    | { type: 'claimRelayFees'; args: ClaimRelayFeesArgs };
