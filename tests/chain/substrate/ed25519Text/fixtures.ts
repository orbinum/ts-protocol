/** Shared inputs for the ed25519Text suites. */
import { readFileSync } from 'node:fs';
import { compactBn } from '@polkadot-api/substrate-bindings';
import { toHex } from '../../../../src/foundation/encoding/hex';
import type { CallName, PjsPayload } from '../../../../src/chain/substrate/ed25519Text/index';
import { textHashFingerprint } from '../../../../src/chain/substrate/ed25519Text/summary';

export const GENESIS = '0x58e2de05e550e64bb73bb2aeb706431dae70dcd1b589d477033c6e3aef3680ae';

/** `system.remark("orbinum solana probe")`, spec 19, tx 7, nonce 0, immortal. */
export const SHORT_PAYLOAD =
    '0x0000506f7262696e756d20736f6c616e612070726f626500000000130000000700000058e2de05e550e64b' +
    'b73bb2aeb706431dae70dcd1b589d477033c6e3aef3680ae58e2de05e550e64bb73bb2aeb706431dae70dc' +
    'd1b589d477033c6e3aef3680ae00';

/**
 * The runtime's own vectors (`node/template/runtime/src/signature/text/tests/fixtures/`,
 * copied to `tests/fixtures/`): each payload must render this text, byte for byte.
 */
export const VECTORS = JSON.parse(
    readFileSync(new URL('../../../fixtures/ed25519_text_vectors.json', import.meta.url), 'utf8')
) as {
    genesis: string;
    vectors: {
        name: string;
        payload: string;
        call: string;
        era: string;
        nonce: number;
        tip: string;
        text: string;
        signable: boolean;
    }[];
    ecdsa: {
        name: string;
        privateKey: string;
        address: string;
        payload: string;
        message: string;
        signature: string;
    }[];
};

/** The runtime's names (spec 21) for the calls the suites build, by pallet and call index. */
const NAMES: Record<string, CallName> = {
    '0000': { pallet: 'System', call: 'remark' },
    '0400': { pallet: 'Balances', call: 'transfer_allow_death' },
    '0403': { pallet: 'Balances', call: 'transfer_keep_alive' },
    '0404': { pallet: 'Balances', call: 'transfer_all' },
    '040a': { pallet: 'Balances', call: 'burn' },
    '0d00': { pallet: 'ShieldedPool', call: 'shield' },
    '0d13': { pallet: 'ShieldedPool', call: 'claim_fees' },
    '0f03': { pallet: 'ValidatorSet', call: 'deregister_validator' },
    '1000': { pallet: 'Session', call: 'set_keys' },
    '1001': { pallet: 'Session', call: 'purge_keys' },
    '1600': { pallet: 'Staking', call: 'bond' },
    '1601': { pallet: 'Staking', call: 'bond_extra' },
    '1602': { pallet: 'Staking', call: 'unbond' },
    '1603': { pallet: 'Staking', call: 'withdraw_unbonded' },
    '1604': { pallet: 'Staking', call: 'validate' },
    '1605': { pallet: 'Staking', call: 'nominate' },
    '1606': { pallet: 'Staking', call: 'chill' },
    '1607': { pallet: 'Staking', call: 'set_payee' },
    '1612': { pallet: 'Staking', call: 'payout_stakers' },
    '1613': { pallet: 'Staking', call: 'rebond' },
    '1615': { pallet: 'Staking', call: 'kick' },
    '161a': { pallet: 'Staking', call: 'payout_stakers_by_page' },
    '1c00': { pallet: 'NominationPools', call: 'join' },
    '1c01': { pallet: 'NominationPools', call: 'bond_extra' },
    '1c02': { pallet: 'NominationPools', call: 'claim_payout' },
    '1c03': { pallet: 'NominationPools', call: 'unbond' },
    '1c04': { pallet: 'NominationPools', call: 'pool_withdraw_unbonded' },
    '1c05': { pallet: 'NominationPools', call: 'withdraw_unbonded' },
    '1c06': { pallet: 'NominationPools', call: 'create' },
    '1c08': { pallet: 'NominationPools', call: 'nominate' },
    '1c09': { pallet: 'NominationPools', call: 'set_state' },
    '1c0a': { pallet: 'NominationPools', call: 'set_metadata' },
    '1c0c': { pallet: 'NominationPools', call: 'update_roles' },
    '1c0d': { pallet: 'NominationPools', call: 'chill' },
    '1c0e': { pallet: 'NominationPools', call: 'bond_extra_other' },
    '1c0f': { pallet: 'NominationPools', call: 'set_claim_permission' },
    '1c10': { pallet: 'NominationPools', call: 'claim_payout_other' },
    '1c11': { pallet: 'NominationPools', call: 'set_commission' },
    '1c12': { pallet: 'NominationPools', call: 'set_commission_max' },
    '1c13': { pallet: 'NominationPools', call: 'set_commission_change_rate' },
    '1c14': { pallet: 'NominationPools', call: 'claim_commission' },
    '1c16': { pallet: 'NominationPools', call: 'set_commission_claim_permission' },
};
export const nameOf = (call: Uint8Array): CallName | null =>
    NAMES[toHex(call.slice(0, 2)).slice(2)] ?? null;

export const remark = (text: string): string => {
    const body = new TextEncoder().encode(text);
    return toHex(new Uint8Array([0, 0, ...compactBn.enc(BigInt(body.length)), ...body]));
};

/** The `action:` value of an immortal, tip-free `remark(text)` at nonce 0. */
export const remarkSummary = (text: string): string => {
    const body = new TextEncoder().encode(text);
    return `System.remark\nlength: ${body.length} bytes\nremark: ${textHashFingerprint(body)}\nexpires: never\nnonce: 0`;
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
