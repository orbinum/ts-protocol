# Changelog

All notable changes to `@orbinum/protocol` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
