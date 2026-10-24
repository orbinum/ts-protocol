/** Shared inputs for the ed25519Text suites. */
import { readFileSync } from 'node:fs';
import { compactBn } from '@polkadot-api/substrate-bindings';
import { toHex } from '../../../../src/foundation/encoding/hex';
import type { CallName, PjsPayload } from '../../../../src/chain/substrate/ed25519Text/index';

export const GENESIS = '0x58e2de05e550e64bb73bb2aeb706431dae70dcd1b589d477033c6e3aef3680ae';

/** `system.remark("orbinum solana probe")`, spec 19, tx 7, nonce 0, immortal. */
export const SHORT_PAYLOAD =
    '0x0000506f7262696e756d20736f6c616e612070726f626500000000130000000700000058e2de05e550e64b' +
    'b73bb2aeb706431dae70dcd1b589d477033c6e3aef3680ae58e2de05e550e64bb73bb2aeb706431dae70dc' +
    'd1b589d477033c6e3aef3680ae00';

/**
 * The runtime's own vectors (`node/template/runtime/src/runtime_tests/fixtures/`, copied
 * to `tests/fixtures/`): each payload must render this text, byte for byte.
 */
export const VECTORS = JSON.parse(
    readFileSync(new URL('../../../fixtures/ed25519_text_vectors.json', import.meta.url), 'utf8')
) as {
    genesis: string;
    vectors: { name: string; payload: string; call: string; tip: string; text: string }[];
};

/** The runtime's names for the calls the suites build, by pallet and call index. */
const NAMES: Record<string, CallName> = {
    '0000': { pallet: 'System', call: 'remark' },
    '0400': { pallet: 'Balances', call: 'transfer_allow_death' },
    '0403': { pallet: 'Balances', call: 'transfer_keep_alive' },
    '0404': { pallet: 'Balances', call: 'transfer_all' },
    '0d00': { pallet: 'ShieldedPool', call: 'shield' },
    '0d13': { pallet: 'ShieldedPool', call: 'claim_fees' },
};
export const nameOf = (call: Uint8Array): CallName | null =>
    NAMES[toHex(call.slice(0, 2)).slice(2)] ?? null;

export const remark = (text: string): string => {
    const body = new TextEncoder().encode(text);
    return toHex(new Uint8Array([0, 0, ...compactBn.enc(BigInt(body.length)), ...body]));
};

export const pjs = (method: string): PjsPayload =>
    ({
        address: '5Ed25519',
        method,
        era: '0x00',
        nonce: '0x00000000',
        tip: '0x00000000000000000000000000000000',
        specVersion: '0x00000013',
        transactionVersion: '0x00000007',
        genesisHash: GENESIS,
        blockHash: GENESIS,
        blockNumber: '0x00000000',
        signedExtensions: [
            'CheckNonZeroSender',
            'CheckSpecVersion',
            'CheckTxVersion',
            'CheckGenesis',
            'CheckMortality',
            'CheckNonce',
            'CheckWeight',
            'ChargeTransactionPayment',
            'CheckMetadataHash',
        ],
        version: 4,
    }) as PjsPayload;
