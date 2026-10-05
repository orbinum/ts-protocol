/**
 * Classification of shielded-pool failures out of raw chain errors.
 *
 * Pallet vocabulary, not app policy. The strings are the runtime's error
 * variants, and what each MEANS for a wallet — resync, purge a note, retry — is
 * protocol knowledge: without it a ghost note reads as a generic failure and
 * the unspendable note stays in the vault.
 *
 * This module answers "what kind of failure, and what should a wallet DO"; the
 * words a person reads belong to the host. Two wallets should agree that
 * `UnknownMerkleRoot` means "rescan and retry" while phrasing it differently.
 */

/**
 * The pallet error name inside a raw chain error, or null.
 *
 * Accepts both quote forms — plain from Substrate, backslash-escaped from the
 * EVM path's nested eth_call message — and a signed extrinsic's
 * `TxResult.error`, `Module(<Pallet>.<Error>)`.
 */
export function extractPalletError(raw: string): string | null {
    return (
        raw.match(/message: Some\(\\?"([^"\\]+)\\?"\)/)?.[1] ??
        raw.match(/Module\(\w+\.(\w+)\)/)?.[1] ??
        null
    );
}

/**
 * What a wallet should do about a failure, independent of how it words it.
 *
 * - `already-spent` — the vault is behind the chain; resync, then let the user
 *   pick again. Retrying the same inputs fails identically.
 * - `ghost-note` — an input is not in the on-chain tree. The note is
 *   unspendable and stays that way; purging it is the only progress.
 * - `stale-proof` — proved against a tree that has moved. A rescan and a fresh
 *   proof succeed, so this one IS worth retrying.
 * - `amount` / `asset` / `shape` — the request was malformed or unaffordable.
 *   Nothing to retry until the user changes it.
 * - `proof` — verification failed. Not user-correctable; it means a bug or a
 *   circuit-version mismatch.
 * - `capacity` — the pool cannot accept more commitments at all.
 * - `balance` — a plain balances-pallet failure, not a shielded-pool one.
 * - `unknown` — a name this SDK version does not classify. Treat as terminal
 *   and show the raw name: a wrong reaction is worse than none.
 */
export type PalletErrorKind =
    | 'already-spent'
    | 'ghost-note'
    | 'stale-proof'
    | 'amount'
    | 'asset'
    | 'shape'
    | 'proof'
    | 'capacity'
    | 'balance'
    | 'unknown';

/**
 * Every `pallet-shielded-pool` error name this SDK classifies, plus the few it
 * meets through the same path. An unlisted name degrades to `unknown`, so a
 * runtime newer than this SDK loses the hint and nothing else.
 *
 * Three entries are not shielded-pool variants:
 *   - `NullifierAlreadySpent` — raised by the SDK's own pre-flight check in
 *     `ops/spend/lifecycle`, worded to match the pallet so one situation
 *     produces one reaction however it was found;
 *   - `InsufficientBalance` / `ExistentialDeposit` — the balances pallet,
 *     reached through the same submit.
 */
const ERROR_KINDS: Readonly<Record<string, PalletErrorKind>> = {
    // Notes and nullifiers
    NullifierAlreadyUsed: 'already-spent',
    NullifierAlreadySpent: 'already-spent',
    CommitmentNotFound: 'ghost-note',
    CommitmentAlreadyExists: 'shape',
    UnknownMerkleRoot: 'stale-proof',

    // Amounts and fees
    InvalidAmount: 'amount',
    InsufficientPoolBalance: 'amount',
    FeeTooLow: 'amount',
    InsufficientPendingFees: 'amount',

    // Relayer calls (commit_relay / claim_relay_fees)
    RelayerNotRegistered: 'shape',
    NotRegistered: 'shape',
    TooManyCommits: 'capacity',

    // Proofs
    InvalidProof: 'proof',
    ProofVerificationFailed: 'proof',
    InvalidPublicSignals: 'proof',

    // Assets
    InvalidAssetId: 'asset',
    AssetNotVerified: 'asset',
    AssetNotSupported: 'asset',
    AssetIdMismatch: 'asset',
    AssetIdAlreadyExists: 'asset',

    // Request shape
    InvalidMemoSize: 'shape',
    MemoCommitmentMismatch: 'shape',
    TooManyInputsOrOutputs: 'shape',
    InvalidRecipient: 'shape',
    EmptyBatch: 'shape',
    FeeRecipientUnavailable: 'shape',

    // Capacity
    MerkleTreeFull: 'capacity',

    // Balances pallet, reached through the same path
    InsufficientBalance: 'balance',
    ExistentialDeposit: 'balance',
};

/** Every error name this SDK classifies. Useful to a host building a copy table. */
export const KNOWN_PALLET_ERRORS: readonly string[] = Object.freeze(Object.keys(ERROR_KINDS));

/**
 * Classifies a pallet error NAME. Returns `unknown` for anything unrecognised,
 * including a runtime newer than this SDK.
 */
export function palletErrorKind(name: string): PalletErrorKind {
    return ERROR_KINDS[name] ?? 'unknown';
}

/**
 * Classifies a RAW chain error, extracting the name first.
 *
 * The RPC fallback matters: a ghost note surfaces as the merkle-proof call
 * failing rather than as a pallet rejection, because the spend never reaches
 * the chain. Same condition, different messenger.
 */
export function classifyChainError(rawMessage: string): PalletErrorKind {
    const name = extractPalletError(rawMessage);
    if (name !== null) {
        const kind = palletErrorKind(name);
        if (kind !== 'unknown') return kind;
    }
    const pool = poolRejectionKind(rawMessage);
    if (pool !== 'unknown') return pool;
    return isMissingMerkleProof(rawMessage) ? 'ghost-note' : 'unknown';
}

/**
 * Pool-admission rejection codes of an unsigned spend (`Custom error: N`), as
 * `pallet_shielded_pool::validate_unsigned::codes` defines them. A gasless spend
 * that would fail is refused here, before any block, so these replace the
 * pallet error names for that path.
 */
const POOL_REJECTION_KINDS: Readonly<Record<number, PalletErrorKind>> = {
    1: 'stale-proof', // UNKNOWN_ROOT: prove against a fresh root
    2: 'shape', // ALL_INPUTS_DUMMY
    3: 'amount', // INSUFFICIENT_POOL_BALANCE
    4: 'amount', // AMOUNT_OVERFLOW
    10: 'proof', // UNSUPPORTED_CIRCUIT_VERSION
    11: 'shape', // INVALID_MEMO
    12: 'proof', // INVALID_PROOF
    13: 'shape', // INVALID_SPEND: a check the dispatchable would fail
};

/** The pool-admission code inside a raw error (`Custom error: N`), or null. */
export function extractPoolRejection(raw: string): number | null {
    const code = raw.match(/Custom(?: error:|\()\s*(\d+)/)?.[1];
    return code === undefined ? null : Number(code);
}

/**
 * Classifies a pool-admission rejection. Besides the custom codes, `Stale`
 * (the nullifier is already spent) and `Payment` (fee below the floor) arrive
 * as standard invalid-transaction variants.
 */
export function poolRejectionKind(raw: string): PalletErrorKind {
    const code = extractPoolRejection(raw);
    if (code !== null) return POOL_REJECTION_KINDS[code] ?? 'unknown';
    if (/Transaction is outdated|\bStale\b/.test(raw)) return 'already-spent';
    if (/Inability to pay some fees|\bPayment\b/.test(raw)) return 'amount';
    return 'unknown';
}

/** The merkle-proof RPC reporting no leaf for a commitment. */
function isMissingMerkleProof(rawMessage: string): boolean {
    return /getMerkleProofByCommitment|commitment not found|no merkle/i.test(rawMessage);
}

/**
 * True when a spend was rejected because an input was already spent on-chain.
 *
 * Covers both the pallet's post-submit rejection and the pre-flight check's
 * wording. Either way the local vault is behind the chain, and the right
 * reaction is a resync — the chain is the authority on spent status.
 */
export function isAlreadySpentError(rawMessage: string): boolean {
    return classifyChainError(rawMessage) === 'already-spent';
}

/**
 * True when a spend failed because an input commitment is not in the on-chain
 * tree — a "ghost" note that never landed (or was pruned). Surfaces either as
 * the merkle-proof RPC failing (no leaf for that commitment) or as the pallet
 * rejecting the proof against a tree that never held it.
 *
 * `UnknownMerkleRoot` is deliberately NOT a ghost note here even though both
 * are proof-versus-tree failures: a stale root means the note exists and a
 * rescan fixes it, while a ghost note is gone for good. Conflating them would
 * either purge a live note or retry forever on a dead one.
 */
export function isGhostNoteError(rawMessage: string): boolean {
    return classifyChainError(rawMessage) === 'ghost-note';
}
