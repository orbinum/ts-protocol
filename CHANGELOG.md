# Changelog

All notable changes to `@orbinum/protocol` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
