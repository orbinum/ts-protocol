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
npm install @orbinum/protocol
# peer deps, if you talk to a Substrate node:
npm install polkadot-api @polkadot/util-crypto
```

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
import {
  isSubstrateAddress,
  isEvmAddress,
  evmToSubstrate,
  formatBalance,
} from '@orbinum/protocol';

isEvmAddress('0xabc…');            // → boolean
evmToSubstrate('0xabc…');          // → SS58 string
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

### Forest geometry

```ts
import { isValidLeafIndex, treeIdOf, LEAVES_PER_TREE } from '@orbinum/protocol';

isValidLeafIndex(leafIndex);   // a leaf index from an untrusted source is real?
treeIdOf({ leafIndex });       // which forest tree that leaf lives in
```

## The custody boundary

This SDK is deliberately incomplete: it cannot build, open, or spend a note,
because doing so needs a spending key. Those operations — key derivation, the
vault, note construction, rescan, witness assembly and proving — live in the
Orbinum wallet, not here. If you are writing a dapp or a script, you compose a
payment (a slip, an address, an amount) with this SDK and route the spend
through a wallet.

A sovereign program that custodies its own seed is a wallet, not a consumer of
this SDK, and belongs on the wallet's side of that line.

## Entry points

| Import         | What it is                                   |
| -------------- | -------------------------------------------- |
| `@orbinum/protocol` | Everything above — the single public surface |

## Requirements

- Node 22+, or any modern browser / RN runtime.
- To reach a Substrate node: `polkadot-api` and `@polkadot/util-crypto` (peers).

## License

MIT
