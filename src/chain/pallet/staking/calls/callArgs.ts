/**
 * Staking, session and validator-set call arguments in the shape PAPI's
 * metadata-driven API takes, checked before anything is signed.
 */
import { fromHex, isHexOfLength } from '../../../../foundation/encoding/hex';
import { MAX_NOMINATIONS, PERBILL } from '../constants';
import { toSs58 } from '../storage/reads';
import type { RewardDestination, SessionKeysWithProof, ValidatorPrefs } from '../types/index';

/** Bytes of `SessionKeys`: an sr25519 Aura key, then an ed25519 GRANDPA key. */
const SESSION_KEYS_BYTES = 64;

const U32_MAX = 0xffff_ffff;

export function assertU32(value: number, where: string): void {
    if (!Number.isInteger(value) || value < 0 || value > U32_MAX) {
        throw new Error(`${where}: not a u32`);
    }
}

/** Distinct SS58 accounts, at most `max`. */
export function accountList(list: unknown, max: number, where: string): string[] {
    if (!Array.isArray(list) || list.length === 0) throw new Error(`${where}: empty`);
    if (list.length > max) throw new Error(`${where}: at most ${max}`);
    const ss58 = list.map((a, i) => toSs58(String(a), `${where}[${i}]`));
    if (new Set(ss58).size !== ss58.length) throw new Error(`${where}: duplicates`);
    return ss58;
}

export function assertAmount(value: bigint, where: string): void {
    if (typeof value !== 'bigint' || value <= 0n || value >= 2n ** 128n) {
        throw new Error(`${where}: amount must be a positive u128 in planck`);
    }
}

/** `RewardDestination` as PAPI encodes it. */
export function payeeArg(payee: RewardDestination, where = 'payee') {
    switch (payee?.type) {
        case 'Account':
            return { type: 'Account', value: toSs58(payee.account, `${where}.account`) };
        case 'Staked':
        case 'Stash':
        case 'None':
            return { type: payee.type, value: undefined };
        default:
            // `Controller` is deprecated and refused by staking; anything else is not a payee.
            throw new Error(`${where}: not a reward destination`);
    }
}

export function bondCallArgs(value: bigint, payee: RewardDestination) {
    assertAmount(value, 'bond.value');
    return { value, payee: payeeArg(payee, 'bond.payee') };
}

export function bondExtraCallArgs(value: bigint) {
    assertAmount(value, 'bondExtra.value');
    return { max_additional: value };
}

/** `unbond` and `rebond` take the same `value`. */
export function amountCallArgs(value: bigint, where: string) {
    assertAmount(value, `${where}.value`);
    return { value };
}

/** `withdraw_unbonded`'s only argument: staking-async ignores it. */
export const WITHDRAW_UNBONDED_ARGS = { num_slashing_spans: 0 } as const;

export function nominateCallArgs(targets: string[]) {
    return { targets: accountList(targets, MAX_NOMINATIONS, 'nominate.targets') };
}

export function validateCallArgs(prefs: ValidatorPrefs) {
    if (typeof prefs?.blocked !== 'boolean') throw new Error('validate.blocked: not a boolean');
    if (!Number.isInteger(prefs.commission) || prefs.commission < 0 || prefs.commission > PERBILL) {
        throw new Error('validate.commission: Perbill parts must be an integer from 0 to 1e9');
    }
    return { prefs: { commission: prefs.commission, blocked: prefs.blocked } };
}

export function payoutStakersCallArgs(validator: string, era: number) {
    assertU32(era, 'payoutStakers.era');
    return { validator_stash: toSs58(validator, 'payoutStakers.validator'), era };
}

/** At most `MAX_NOMINATIONS` per call: more could not be signed as text (`MAX_LISTED_ACCOUNTS`). */
export function kickCallArgs(who: string[]) {
    return { who: accountList(who, MAX_NOMINATIONS, 'kick.who') };
}

/**
 * `Session.set_keys`: `keys` split into `{ aura, grandpa }` and the ownership
 * proof. The runtime checks the proof, so an empty one fails (`InvalidProof`).
 * PAPI takes fixed-size keys as hex and the proof's `Vec<u8>` as bytes.
 */
export function setKeysCallArgs({ keys, proof }: SessionKeysWithProof) {
    if (!isHexOfLength(keys, SESSION_KEYS_BYTES)) {
        throw new Error('setKeys.keys: not 64 bytes of 0x hex (aura ++ grandpa)');
    }
    if (typeof proof !== 'string' || !/^0x([0-9a-fA-F]{2}){64,256}$/.test(proof)) {
        throw new Error('setKeys.proof: not an ownership proof (64 to 256 bytes of 0x hex)');
    }
    const hex = keys.toLowerCase();
    return {
        keys: { aura: `0x${hex.slice(2, 66)}`, grandpa: `0x${hex.slice(66)}` },
        proof: fromHex(proof),
    };
}
