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

| Import              | What it is                                   |
| ------------------- | -------------------------------------------- |
| `@orbinum/protocol` | Everything above — the single public surface |

## Requirements

- Node 22+, or any modern browser / RN runtime.
- The peers `polkadot-api` and `@polkadot/util-crypto`, always (see Installation).

## License

MIT
