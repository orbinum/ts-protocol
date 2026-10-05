# Changelog

All notable changes to `@orbinum/protocol` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0] - 2026-10-05

**Breaking** — for runtime spec 17: a shield carries a proof that its note is worth
exactly the deposit.

### Changed

- **`ShieldParams`** gains `proof: Uint8Array` and `circuitVersion: number`, and
  `ShieldBatchItem` is now `ShieldParams`. `ShieldedPoolModule.shield` and
  `shieldBatch` pass both.
- **Precompile shield** is `shield(uint32,bytes32,bytes,bytes,uint32)` —
  `SP_SEL.SHIELD` = `0xf25897e0` (was `0x9feb22ea`). `buildShieldCalldata` and
  `estimateShieldGas` encode the proof and version.
- `decodePrecompileCalldata` reads both shield ABIs and adds `circuitVersion` for
  the new one; the pre-proof selector stays in its table so history still
  decodes. The extrinsic mapper adds `proof` and `circuit_version` to shield and
  `shield_batch` entries (absent before spec 17).
- Every shield path — `shield`, `shieldBatch` and `buildShieldCalldata` —
  refuses before building the call an asset past `u32`, an amount outside
  `1..u128`, a malformed memo, an empty proof or a circuit version past `u32`,
  naming the field (`shieldBatch.items[1].proof`).

### Added

- **`shieldCallArgs(params)` / `shieldBatchCallArgs(params)`**: the arguments
  `ShieldedPoolModule` submits, validated, for a host that submits through its
  own PAPI flow — so it encodes what the module does instead of a copy.
- `CircuitId.Shield` (3).
- `AssetNotSupported` classified as an `asset` error: the pool moves only the
  native asset.

### Fixed

- **A failed signed call lost its error name.** `TxResult.error` read
  `Module(ShieldedPool)`, so `classifyChainError` saw no name and every on-chain
  rejection classified as `unknown`. It is now `Module(<Pallet>.<Error>)`, and
  `extractPalletError` reads that form.
- **`shieldBatch` never encoded.** It passed the operations as a bare array of
  objects with a string `amount`; the call takes `{ operations }` of tuples with a
  `u128`. Each entry is now a tuple in argument order.

### Security

- `pnpm audit` is clean: `pnpm.overrides` lift `deepmerge-ts` and `esbuild`,
  both reached only through the `polkadot-api` CLI, a dev dependency.

## [0.6.0] - 2026-09-28

**Breaking** — for runtime spec 16, with every compatibility shim removed:
`claimShieldedFees`, `CircuitId.ValueProof`, `RECOVERED_TX_RESULT` and
`evmAddressToAccountId` are gone, `addressToFieldElement` needs the circuit
version, and new notes are v2.

### Added

- **`memoHash(memos)`** — the `memo_hash` public input of the v2 transfer and
  unshield circuits: blake2_256 over the SCALE-encoded memo list, little-endian,
  reduced mod BN254 `r`. It binds the encrypted memos to the proof, so a copy of a
  spend with swapped memos no longer verifies. Byte-for-byte identical to what
  the chain derives (`statement::memo_digest`, reduced mod r); the test vectors
  are shared with the node and `@orbinum/wallet-sdk`.
- **Public relay fee claim (runtime spec 16).** `ShieldedPoolModule.claimRelayFees`
  (`claim_relay_fees`, signed, no note or proof) and, on the precompile,
  `ShieldedPoolPrecompile.claimRelayFees` / `buildClaimRelayFeesCalldata` /
  `estimateClaimRelayFeesGas` (`claimRelayFees(uint32,uint256)`, `0x2a3274dd`).
  The pallet pays the account of the caller's registered EVM address, or the
  caller when unregistered.
- **Relayer selectors and decoders:** `SP_SEL.COMMIT_RELAY` (`0xc9b235ff`) and
  `SP_SEL.CLAIM_RELAY_FEES`; `decodePrecompileCalldata` names both.
- **Pool rejection codes.** `extractPoolRejection(raw)` reads `Custom error: N`
  from a refused unsigned spend and `poolRejectionKind(raw)` maps it (and
  `Stale` / `Payment`) to a `PalletErrorKind`; `classifyChainError` falls back to
  them. New pallet names: `RelayerNotRegistered`, `NotRegistered`,
  `TooManyCommits`.
- **Claim parameters are checked the same on both paths.** `claimRelayFees`
  (pallet) and `buildClaimRelayFeesCalldata` (precompile) share one check:
  `assetId` a u32 and `amount` in `1..2^128-1`. The pallet path used to accept an
  out-of-range asset id or amount and fail only at encoding.
- **Extrinsic and event mappers follow spec 16.** `mapExtrinsicArgs` names
  `private_transfer`'s `asset_id` / `fee` / `circuit_version`, `unshield`'s `fee`
  / change note / `circuit_version`, `commit_relay`, `claim_relay_fees`, and
  zk-verifier `retire_version` / `unretire_version` / `purge_circuit`.
  `mapZkEventData` maps `Unshielded`'s change note, `TreeSealed`,
  `RelayFeesClaimed`, `VersionRetired` / `VersionUnretired`, `CircuitPurged` and
  `BatchVerificationKeysRegistered`.
- **Spec-16 pallet types:** `CommitRelayArgs` / `ClaimRelayFeesArgs` in
  `ShieldedPoolCall`, and `RelayFeesClaimedEvent` in `ShieldedPoolEvent`.

### Removed

- **`claimShieldedFees`** — builders (`buildClaimShieldedFeesCalldata`,
  `ClaimShieldedFeesParams`), its `0x88d9deba` selector and its decoder: the call
  is gone in runtime spec 16 and was never called on-chain, so
  `decodePrecompileCalldata` returns null for it.
- `'shieldBatch'` from `PrecompileMethod`: the precompile has no such selector,
  so it was never produced.
- **`CircuitId.ValueProof`** (6): the circuit is retired on-chain and
  `@orbinum/circuits` 0.15.0 no longer ships it. `CircuitId` is now
  `{ Transfer: 1, Unshield: 2 }`.
- The unexported, unused pallet-zk-verifier call and event types, which had
  fallen behind the pallet (no retire / unretire / purge).
- **`ZkVerifierCircuitVersionInfo.proofSystem` / `historicalVersions`,
  `ZkVerifierVkHash.stats`** and the `ZkVerifierVersionStats` /
  `ZkVerifierHistoricalVersion` types: the node's `zkVerifier_*` RPC returns
  none of them, and the module filled them with constants.
- **`RECOVERED_TX_RESULT`**: use `recoveredTxResult(txHash)`, which keeps the
  hash.
- **`evmAddressToAccountId`** (Ethereum's prefix padding): no Orbinum account
  is formed that way; `evmToImplicitSubstrate` is the runtime's mapping.
- Mapper aliases for names the chain does not use: the `deposit`, `withdraw`,
  `merkleroot` and `privatetransfer` events, the `transfer` call, and alternate
  field names.

### Fixed

- **`mapZkEventData` no longer maps `balances.Deposit` / `Withdraw` as shielded
  events.** It keys on the method name alone, and its `deposit` / `withdraw`
  aliases for `Shielded` / `Unshielded` swallowed the balances events (fee
  refunds and withdrawals) with the wrong fields. `Withdraw` now reaches the
  balances mapping.

### Changed

- **`CURRENT_CIRCUIT_VERSION` = 2.** New notes are created under the memo-bound
  transfer / unshield circuits; v1 notes keep their stamp and spend under v2.
- **`addressToFieldElement(address, circuitVersion)`** — circuit v2 binds the
  unshield recipient as `blake2_256(accountId32)` little-endian mod `r`. v1's raw
  `mod r` maps an account `R` and its alias `R ± r` to the same scalar, which let
  a copier redirect a pending unshield to an account nobody controls. The version
  is required — the one you prove with; any version other than 1 or 2 throws
  rather than guessing a rule.

## [0.5.0]

### Added

- **`DeliveryConfirmedEvent`**, and a matching arm on `IsmpMessagingEvent` — runtime
  spec 14's `ismpMessaging.DeliveryConfirmed { commitment, relayer, height }`.

  This is the chain's own witness to an outbound POST landing, which it previously had
  none of: `PostRequestHandled` fires on the destination, so from local state a delivered
  message and one still in flight were the same thing. The protocol offers no reply path —
  upstream #840 removed `PostResponse` — so the runtime proves delivery by reading the
  destination's `RequestReceipts` entry over a GET and verifying a state proof.

  `commitment` names the POST being confirmed, not the GET that proved it; those are
  different messages. `relayer` carries the same caveat as `RequestHandledEvent.relayer` —
  opaque bytes, not necessarily an account. `height` is the remote height the receipt was
  proven at.

  Note what it does not claim: the receipt read is the **coprocessor's**, so this proves
  Hyperbridge accepted and forwarded the message. Execution on the final chain is one hop
  further and is not witnessed here.

### Changed

- `IsmpMessagingEvent` now has eight arms, not seven. A consumer matching exhaustively over
  it will need the new case — which is the intended loud failure.

## [0.4.0] - 2026-09-10

### Added

- **The commitment of a request can be rebuilt off-chain** (`requestCommitment`,
  `encodePostRequest`, `encodeGetRequest`). This is what lets a caller join an
  event to the request it describes, and what a relayer must do to prove one.

  A commitment is `keccak256(abi.encode(request))` — **Solidity ABI, not
  SCALE**. `Request::encode()` is an inherent method that SHADOWS the SCALE
  `Encode` trait (`ismp-2606.1.0/src/router.rs:263`), so Rust reads as if it
  were SCALE while emitting 32-byte-word ABI output. Off-chain the difference
  is silent: a SCALE encoding hashes fine and yields a value the chain has
  never seen, surfacing much later as `UnknownRequest`.

  Two details a caller would otherwise get wrong, both verified against the
  pallet's own output rather than inferred:

  - **`source` and `dest` are the DISPLAY strings** — `"SUBSTRATE-orbi"`,
    `"KUSAMA-4009"` (`abi.rs:64-76`). Not SCALE variants. `ismp_queryRequests`
    returns exactly these, so its output is hashable as-is; converting to
    `{ type: 'Kusama', value: 4009 }` first breaks the hash.
  - **The GET field order is not the Rust struct's**: `source, dest, nonce,
    from, timeoutTimestamp, keys, height, context`.

  Pinned by tests against two vectors the runtime itself printed, plus the
  first real cross-chain read this chain performed. If an upstream bump changes
  the wire format they fail loudly instead of producing unmatchable hashes.

- **Reading Hyperbridge's ISMP child trie** (`childTrieProof`,
  `ISMP_CHILD_TRIE`, `commitmentKey`, `receiptKey`). For the coprocessor,
  `ismp-grandpa` records `state_root = child_trie_root`
  (`consensus.rs:142-150`) — verified live: a stored commitment equals
  Hyperbridge's `ismp.childTrieRoot` at that height, not its header's state
  root. So a GET against Hyperbridge can only prove keys inside that trie, and
  one for a global key such as `Ismp::Nonce` is unverifiable by construction.

  `childTrieProof` uses `ismp_queryChildTrieProof`, the RPC Tesseract itself
  uses. Two encoding traps are handled and documented: keys travel as arrays of
  bytes, not hex; and `proof` is a `Vec<u8>` containing a SCALE `Vec<Vec<u8>>`
  — decoding it per element yields one bogus node per byte.

  `receiptKey`'s absence is **not** proof of transit: the handler stores the
  receipt before the module callback and deletes it if the callback errs
  (`handlers/request.rs:112-125`), so a refused message and one in flight look
  identical from outside.

### Changed

- **Event types now match runtime spec 13**, which added twenty fields the SDK
  did not know about. `RequestDispatched` gains `nonce`, `timeoutTimestamp`,
  `bodyLen` and `kind`; `MessageReceived` and `MessageRejected` gain the
  sender's nonce and deadline (plus `bodyLen` on the rejection);
  `GetResponseReceived` gains `dest`, `height`, `nonce` and `timeoutTimestamp`;
  `RequestTimedOut` gains `kind`, `nonce`, `timeoutTimestamp` and `bodyLen`.
  Consumers on 0.3.0 compile today and read `undefined` from fields the chain
  is in fact emitting.

  New `RequestKind` (`'Post' | 'Get'`), carried by `RequestDispatched` and
  `RequestTimedOut`. The distinction is load-bearing: a POST is handed to a
  module on the destination and may be refused, a GET addresses storage and has
  no receiving module at all.

  `timeoutTimestamp` has **three** states and conflating any two is a bug: `0n`
  means never expires (upstream's explicit branch, **not** 1970), absent means
  the block predates spec 13, anything else is a real deadline.

  `GetResponseReceived.height` is the only genuine remote block number this
  pallet emits — an inbound POST carries no origin height, because its proof is
  verified against Hyperbridge's state rather than the origin's.

  On a GET, `RequestDispatched.to` is **our own** module id: the address the
  answer routes back to, not a recipient.

- **`relayer` on `PostRequestHandled` / `GetRequestHandled` is not necessarily
  an account.** The host takes whatever the submitter signed with, verbatim up
  to 32 bytes (`pallet-ismp/src/host.rs:351`). A relaying script can leave an
  ASCII tag there, so decide what it is before rendering it as an address.

- **Who answers a GET, on a Substrate chain.** The public relayer does not:
  Tesseract resolves GETs on Hyperbridge and delivers the response only to EVM
  sources (`tesseract/messaging/messaging/src/events.rs:314-336`, "Substrate
  sinks can't verify the mmr proof"). A `dispatch_get` from a Substrate chain
  goes unanswered unless something of yours carries the proof back. The chain
  verifies it either way — a relayer supplies bytes, not trust.

### Breaking

- `PostRequest.nonce`, `PostRequest.timeoutTimestamp`, `GetRequest.nonce`,
  `GetRequest.height` and `GetRequest.timeoutTimestamp` are now `bigint`. The
  chain declares them u64 and `number` silently loses precision past 2^53. The
  RPC hands them over as JSON numbers, so widen them (`BigInt(raw.nonce)`)
  before hashing — otherwise the commitment will not reproduce.

## [0.3.0] - 2026-09-08

### Added

- **ISMP types and a typed `ismp_*` client**, for the Hyperbridge cross-chain
  integration. `client.ismp` exposes request lookup by commitment, the height
  each counterparty channel has proven, and the ISMP event stream for a block
  range. Read-only: dispatching a message is an extrinsic, and a root-only one
  on this chain.

  Two shapes are modelled that a consumer would otherwise get wrong, both
  verified against a running node rather than inferred:

  - **A request comes back wrapped in its variant** — `[{ Post: { … } }]`, not
    flattened. Reading `result[0].source` yields `undefined`, so `IsmpRequest`
    is a union that forces narrowing first.
  - **A chain is named differently by each transport.** The `ismp_*` RPCs
    serialise a state machine as a string (`"KUSAMA-1000"`), while decoded block
    events give the SCALE enum (`{ type: 'Kusama', value: 1000 }`). Both are
    typed; assuming one silently reads `undefined` from the other.

  Event types cover all seven `ismpMessaging` variants and the seven `ismp`
  variants worth modelling — including the `commitment` that runtime spec 12
  added to `MessageReceived`, `MessageRejected`, `RequestTimedOut` and
  `GetResponseReceived`. Before that field existed an arrival could not be
  attributed to any message and an expiry could not be matched to what expired.

  `latestHeight` and `challengePeriod` return `null` rather than throwing when a
  channel is unknown: the RPC answers with an error code for absent state, which
  at the JSON-RPC layer is indistinguishable from a transport failure, and
  "not onboarded yet" is a normal state during setup.

## [0.2.0] - 2026-09-02

### Added

- **`UnsafeTx` is now exported**, along with `SubmitOptions` and a re-export of
  PAPI's `TxFinalizedPayload`. A consumer building transactions off the dynamic
  (unsafe) api can type them from here instead of re-declaring the shape.
  A private copy of that interface rots silently when polkadot-api renames a
  method: the app had one, and it is how the `signAndSubmit` → `createAndSubmit`
  mismatch below reached a wallet.

### Fixed

- Pinned `UnsafeTx` against PAPI's real `Transaction` at the type level
  (`tests/chain/unsafeTx.types.test.ts`), so a polkadot-api rename fails the
  typecheck instead of surfacing as `tx.<method> is not a function` when a user
  signs. `UnsafeTx` is hand-written — the unsafe api has no chain descriptors to
  instantiate PAPI's generic from — and `callUnsafeTx` reaches it through a cast,
  so nothing in the source compared the two. Each method is asserted separately,
  so a failure names the one that drifted.

- Corrected a `signAndSubmitTx` docstring still referring to
  `signSubmitAndWatch`, which polkadot-api 3 renamed to `createSubmitAndWatch`.

## [0.1.0] - 2026-09-01

First release. The public Orbinum protocol package: everything a consumer needs to read the
chain, build a payment slip, or verify a note disclosure — and **nothing that
can spend**.

### Added

#### Chain access

- **`OrbinumClient`** and `OrbinumClientProvider` — the entry point, composing
  the modules below over one connection.
- **`SubstrateClient`** — PAPI wrapper with raw JSON-RPC, HTTP batching for
  high-throughput backfill, unsafe transaction building, and submission with or
  without watching.
- **`EvmClient`** and **`EvmExplorer`** — the EVM side: blocks, transactions,
  logs, token transfers.
- Pallet modules: **`ShieldedPoolModule`** (shield / unshield / private transfer
  / fee claim), **`ZkVerifierModule`** (circuit versions and VK hashes),
  **`RelayerStatusModule`**, **`ChainModule`**, **`PrivacyModule`**.
- **`ShieldedPoolPrecompile`** and **`CryptoPrecompiles`** — the EVM route into
  the same pallet, plus `decodePrecompileCalldata` and `getPrecompileLabel` for
  reading someone else's call.
- Transaction helpers: `signAndSubmitTx`, `toTxResult`, `feePaidFrom`, and the
  connection-loss recovery pair `isConnectionLossError` / `txLandedAfterError` —
  a WebSocket that drops between submit and finalization must not be reported as
  a rejection, because the user then retries and double-spends.
- Chain error classification: `classifyChainError`, `extractPalletError`,
  `isAlreadySpentError`, `isGhostNoteError`.

#### Protocol (the public half)

- **Payment slip** — `sealPaymentSlip` / `openPaymentSlip` and its codec: the
  sealed handoff a dapp gives a wallet. Sealing generates its own ephemeral
  keypair and refuses a caller-supplied one; both directions reject low-order
  viewing keys, which would collapse the ECDH secret to eight enumerable values.
- **Note disclosure** — `createNoteDisclosureKey` / `decodeNoteDisclosureKey`:
  an `orbdisc:` string proving what a note holds **without granting any power to
  spend it**. Decoding recomputes the Poseidon commitment, so a forged or edited
  key fails rather than decoding into a lie. This is the capability written for
  third parties: an auditor, an exchange, a quest verifier.
- **Memo wire format** — `MemoFormat`, `ENCRYPTED_MEMO_SIZE`, `bytesToBjjScalar`.
  The chain stores a memo as an opaque 180-byte blob, so this defines its size
  and what counts as well-formed. Sealing and opening one are custody and are
  not here.
- **Forest geometry** — `treeIdOf`, `isValidLeafIndex`, `LEAVES_PER_TREE`. Pure
  arithmetic over a leaf index, which is public on chain.
- Public note vocabulary: `ScanCommitment`, `NoteFacts`, `MerkleTreeInfo`,
  `CURRENT_CIRCUIT_VERSION`.

#### Foundation

- Encoding: hex, bytes, base64 and base64url, `bigintTo32Le` and its inverses,
  and the `commitmentHexOf` / `leHexToBigint` pair — the little-endian form
  every index into a note is keyed by. Reaching for big-endian produces a
  well-formed string that matches nothing, silently.
- Addresses: EVM ↔ Substrate conversion, SS58, unified accounts, and the
  circuit's own address mapping (`addressToFieldElement`).
- Signers: `getSubstrateSigner` (raw keypair), `getSubstrateSignerFromExtension`
  (browser wallet), and the `hasInjectedExtensions` guard they pair with — which
  returns "none" instead of throwing in React Native, Node, or an extension's
  own service worker, where `window.injectedWeb3` does not exist.
- Curve primitives: `fastMulBase`, `fastMulPoint`, `unpackUsableViewingKey`.
- Capability guards: `requireSubtleCrypto`, `requireRandomValues`, and the
  `MissingCryptoError` they throw — so a host that lacks WebCrypto learns which
  capability is missing, instead of a `TypeError` from deep inside a call.
- Balance formatting and amount parsing.

### Security

- **This package cannot spend.** It has no key derivation, no note decryption,
  no vault and no proof witness — that code is not in it. What is here either
  reads public chain data, marshals fields the caller supplies (a proof arrives
  already made; `ShieldedPoolModule.unshield` relays it into an extrinsic rather
  than creating it), or is pure encoding and curve arithmetic.

- The only HKDF use is the payment slip's own cipher key, under the
  `orbinum-payment-slip-v1` domain, and that derivation is not exported. The
  slip's ephemeral keypair is generated internally and a caller-supplied one is
  refused, which is what keeps the 8-byte nonce suffix safe: every envelope
  encrypts under a different key, so the (key, nonce) pair ChaCha20-Poly1305
  requires to be unique cannot repeat.

- Both slip directions reject low-order viewing keys. BabyJubJub has a cofactor
  of 8, so a point from the small subgroup collapses the ECDH secret to at most
  eight values an interceptor can simply try — and the all-zero packed value is
  one of them, which the usual all-zero check does not catch because it is a
  legitimate order-4 point rather than the neutral element.


### Notes

- 113 runtime exports and 81 types. ESM and CommonJS, with declarations for both.
- Node 22+, or a browser / React Native runtime with `crypto.getRandomValues`.
  `crypto.subtle` is not needed — nothing here derives a key.
- `atob` must exist at import time — `poseidon-lite` decodes its round constants
  at module scope. React Native hosts polyfill it before importing.
- Peer dependencies: `polkadot-api` ^3.1.0, `@polkadot/util-crypto` ^14.
