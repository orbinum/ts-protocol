# @orbinum/protocol

The public TypeScript SDK for Orbinum — chain access, address handling,
encoding, note types, and the payment slip a dapp hands a wallet.

**It holds no keys.** Nothing here derives or handles a spending key. A dapp,
a script or an automation talks to the chain and asks an Orbinum wallet to pay;
the wallet owns the custody. A package anyone can install is the wrong place for
a spending key, so the code that touches one is not in this package at all — it
lives in the wallet, behind the wallet's own trust boundary.

Environment-agnostic: a browser tab, an extension service worker, React Native,
Node and Cloudflare Workers all run it.

## Installation

```bash
npm install @orbinum/protocol polkadot-api @polkadot/util-crypto
```

Both peers are required: the bundle imports them when it loads, so any import
of `@orbinum/protocol` fails without them, whatever you use from it.

## What it gives you

```
foundation/  encoding, addresses, balance formatting, low-level crypto
protocol/    note types, the encrypted memo, the payment slip, tree geometry
chain/       OrbinumClient — Substrate + EVM, RPC, the shielded-pool pallet
```

## Quick start

### Talk to a node

```ts
import { OrbinumClient } from '@orbinum/protocol';

const client = await OrbinumClient.connect({
    substrateWs: 'ws://localhost:9944',
    evmRpc: 'http://localhost:9933',
});

const stats = await client.privacy.getPoolStats();
console.log('root:', stats.merkleRoot, 'leaves:', stats.commitmentCount);

client.destroy();
```

### Addresses

```ts
import { isSubstrateAddress, isEvmAddress, evmToSubstrate, formatBalance } from '@orbinum/protocol';

isEvmAddress('0xabc…'); // → boolean
evmToSubstrate('0xabc…'); // → SS58 string
formatBalance(1_000_000_000_000n); // → human-readable
```

### Hand a wallet a payment slip

A payment slip carries only what is already public on chain — a note's
commitment, its encrypted memo, and its leaf index — sealed toward the
recipient's privacy address. It **grants no spend power**: the recipient opens
it with their own viewing key. It is how a dapp tells a wallet "here is a
payment for you" without either side scanning the pool.

```ts
import { sealPaymentSlip, encodePaymentSlip } from '@orbinum/protocol';

// The recipient's packed viewing public key comes first — it is what the slip
// is sealed toward.
const envelope = sealPaymentSlip(recipientIvkPacked, fields);
const wire = encodePaymentSlip(envelope); // → 'orbslip1:…' — hand this to the wallet
```

### Verify a payment in your backend

A payment made through Orbinum Hub returns a payment proof (`orbproof1:`). Your
backend checks it with your **public** `orbpriv3:` address alone — no secret
on the server — and confirms the note is in a **finalized** block:

```ts
import { OrbinumClient, verifyPaymentProof } from '@orbinum/protocol';

const client = await OrbinumClient.connect({ substrateWs: 'wss://your-node' });
const result = await verifyPaymentProof(order.paymentProof, {
    address: 'orbpriv3:…', // yours, public
    tree: client.privacy,
    expected: { value: order.amount, assetId: 0n },
});
if (result.ok) markPaid(order, result.payment.commitmentHex); // one payment, one order
```

`ok: false` carries a `reason` (`invalid-proof`, `wrong-asset`, `wrong-amount`,
`not-on-chain`, or `not-final` — landed, not finalized yet: retry in a few
seconds); a node that cannot answer throws, so you retry instead of rejecting
a paid order. `finality: 'best'` accepts the node's best block instead — faster,
but a reorganisation can revert it; only for amounts you can afford to lose. `verifyPayment(slip, { key, … })` does the same from a
payment slip with your viewing key (`orbview1:`), which also proves a sender
named by address. A slip proves a note **to you** exists, not who made it:
its fields are public on chain and anyone can seal them to your address. Settle
orders from the public only with proofs; use slips for your own wallet,
reconciliation, or a payer named by address.

**Not on Node?** Each release ships `orbinum-verify.wasm`, a WASI command that
runs the same offline check (`checkPaymentProof`) from any language: one JSON
request on stdin, one JSON answer on stdout. Your backend then asks its node
about the commitment itself.

```sh
echo '{"proof":"orbproof1:…","address":"orbpriv3:…","value":"1500","assetId":"0"}' \
  | wasmtime orbinum-verify.wasm
# {"ok":true,"payment":{"commitmentHex":"0x…","value":"1500","assetId":"0","sender":{"kind":"anonymous"}},"storageKey":"0x…"}
```

On `ok: true`, read `storageKey` in the finalized chain on your node:
`state_getStorage(storageKey, chain_getFinalizedHead())`. Non-null means paid
and final; null means not paid, or not final yet (retry in a few seconds); an
RPC error means retry. `assetId` is required. The released module is the
exact build CI tested, attested: `gh attestation verify orbinum-verify.wasm -R orbinum/ts-protocol`.
Python (`wasmtime`), Go (`wazero`), Rust, PHP and Ruby all embed WASI modules.

**Before you ship it:**

- **One payment, one order.** Key orders on the verified `commitmentHex`, under
  a unique constraint written with the order. Never on a `txHash`, a leaf index
  or your `reference`: a payer can repeat or change those.
- **Trust your node.** The chain check believes the node that answers it, and
  names the commitment to it. Run one, or use one you trust; for large amounts,
  ask two independent nodes and require both to agree.
- **Wait for finality.** The default; `finality: 'best'` trades it for speed.
- **A proof is a bearer token.** Whoever holds it can present it, and it
  reveals that payment's amount and declared sender (nothing about the payer's
  other notes). Accept it only inside the session that created the order it
  pays, over TLS; do not log it. Store it with the order (not in logs): your
  wallet finds payments by the memo on chain, and a payer who lands the note
  with another memo leaves the proof as its only key.
- **A viewing key reads everything** sent to its address and cannot be revoked.
  Prefer proofs; if you hold one, keep it like an API secret. Its
  multiplications run on a constant-time path (`secretMulPoint`), so callers
  cannot time it out of your server — JS BigInt is not constant-time itself,
  so do not expose verification to unauthenticated traffic at volume.

### Forest geometry

```ts
import { isValidLeafIndex, treeIdOf, LEAVES_PER_TREE } from '@orbinum/protocol';

isValidLeafIndex(leafIndex); // a leaf index from an untrusted source is real?
treeIdOf({ leafIndex }); // which forest tree that leaf lives in
```

## Connect a dapp to Orbinum Wallet

`@orbinum/protocol/provider` is what a dapp needs to talk to the wallet, and
nothing else: it loads no peer, so a dapp that only talks to the wallet does not
need `polkadot-api`.

The wallet gives every account two public faces with **separate balances**:

- the **substrate** account (SS58), which pays public ORB transfers;
- the **EVM** account (`0x…`), which calls contracts. The chain lets only an EVM
  key call contracts.

Every payment and every signature is approved by the user in the wallet.

### `window.orbinum`

For what EIP-1193 has no words for: public ORB transfers, private payments,
private calls.

```ts
import { waitForOrbinumProvider, providerRpcErrorOf } from '@orbinum/protocol/provider';

const orbinum = await waitForOrbinumProvider(); // null: the wallet is not installed
if (!orbinum) return showInstallLink();

const [account] = await orbinum.request({ method: 'orbinum_requestAccounts' });
// account.substrate: '5…', account.evm: '0x…'

// A public payment, from the substrate account. Amounts are planck, as strings.
const paid = await orbinum.request({
    method: 'orbinum_transfer',
    params: { to: merchantSs58, value: String(15n * 10n ** 17n) }, // 1.5 ORB
});

// A private payment: nothing on chain ties it to the payer. The proof goes to your
// backend, which checks it with verifyPaymentProof (see above).
const { paymentProof } = await orbinum.request({
    method: 'orbinum_privateTransfer',
    params: { to: 'orbpriv3:…', value: String(10n ** 18n) },
});

// Contract calls paid from the shielded balance, through the shared executor.
// What comes back returns to the wallet as a private note.
const receipt = await orbinum.request({
    method: 'orbinum_privateCall',
    params: { steps: [{ target, input: calldata, value: '0' }], amount, minReturn },
});
```

| Method | What it does | Asks the user |
| --- | --- | --- |
| `orbinum_requestAccounts` | connects publicly; resolves to the accounts | once per site |
| `orbinum_requestPrivateConnection` | connects privately: the site sees no account (`permissions.connection === 'private'`) | once per site |
| `orbinum_privacyAddress` | the `orbpriv3:` address, once the site has the `privacy` permission; else `null` | no |
| `orbinum_accounts`, `orbinum_chain`, `orbinum_permissions` | reads what this site may see | no |
| `orbinum_requestPermissions` | `{ privacy: true }`: shares the `orbpriv3:` address (in the accounts, and `orbinum_privacyAddress`) | once per site |
| `orbinum_transfer` | public ORB transfer from the substrate account | every time |
| `orbinum_privateTransfer` | private payment to an `orbpriv3:` address; resolves with an `orbproof1:` proof. Any site may ask, connected or not; the user chooses what the recipient learns of the sender | every time |
| `orbinum_privateCall` | EVM calls paid privately (1–8 steps). The fee is paid even if a step fails, so the wallet simulates first | every time |
| `orbinum_signMessage` | the account signs `<Bytes>message</Bytes>` with its own key — EIP-191 for an Orbinum Wallet account (`scheme: 'eip191'`) | every time |

Events: `accountsChanged`, `chainChanged`, `permissionsChanged`, `connect`,
`disconnect`.

### viem, ethers, any EIP-1193 library

The wallet's EVM provider is announced through EIP-6963 as
`network.orbinum.wallet`. Find it by that, not through `window.ethereum`, which
another wallet may hold:

```ts
import { createWalletClient, custom } from 'viem';
import { getOrbinumEip1193Provider } from '@orbinum/protocol/provider';

const provider = await getOrbinumEip1193Provider();
const client = createWalletClient({ transport: custom(provider!) });
const [address] = await client.requestAddresses();
await client.writeContract({ address: token, abi, functionName: 'transfer', args, account: address });
```

It answers the account, chain, `eth_sendTransaction`, `personal_sign`,
`eth_signTypedData_v4` and `wallet_switchEthereumChain` methods itself, and
forwards a fixed list of public reads (`ORBINUM_EIP1193_METHODS.reads`) to its
node. Any other method is refused with 4200.

### Errors

Both providers reject with the same codes. `providerRpcErrorOf(error)` reads
them, whether the error is a class or the plain `{ code, message }` that crossed
the page.

| Code | `PROVIDER_ERROR_CODES` | Meaning |
| --- | --- | --- |
| 4001 | `userRejected` | the user declined |
| 4100 | `unauthorized` | the site is not connected, or lacks the permission |
| 4200 | `unsupportedMethod` | the wallet does not answer that method |
| 4900 / 4901 | `disconnected` / `chainDisconnected` | the wallet cannot reach the chain |
| 4902 | `unrecognizedChain` | `wallet_switchEthereumChain` to a chain it does not offer |
| -32602 | `invalidParams` | malformed params (the guards, e.g. `isOrbinumTransferParams`, check them before sending) |

### EVM signing, for wallets

`eip1559SigningHash`, `serializeSignedEip1559`, `personalMessageHash` and
`typedDataHash` (in the root entry) build what an EVM account signs, without a
key. A wallet signs the 32-byte hash with its own secp256k1 key and submits the
result with `EvmClient.sendRawTransaction`.

## The custody boundary

This SDK is deliberately incomplete: it cannot build or spend a note, because
doing so needs a spending key. (It opens one only to verify a payment, with a
viewing key or a payer's proof.) Those operations — key derivation, the
vault, note construction, rescan, witness assembly and proving — live in the
Orbinum wallet, not here. If you are writing a dapp or a script, you compose a
payment (a slip, an address, an amount) with this SDK and route the spend
through a wallet.

A sovereign program that custodies its own seed is a wallet, not a consumer of
this SDK, and belongs on the wallet's side of that line.

## Entry points

| Import                       | What it is                                                  |
| ---------------------------- | ----------------------------------------------------------- |
| `@orbinum/protocol`          | Chain access, encoding, notes, payment slips and proofs     |
| `@orbinum/protocol/browser`  | Connecting a Substrate browser extension (`injectedWeb3`)   |
| `@orbinum/protocol/provider` | Connecting a dapp to Orbinum Wallet — no peer at runtime    |

## Requirements

- Node 22+, or any modern browser / RN runtime.
- The peers `polkadot-api` and `@polkadot/util-crypto` for the root and
  `/browser` entries (see Installation). `/provider` needs neither.

## License

MIT
