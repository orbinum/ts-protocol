/**
 * What the signed text shows of a transaction, as the runtime renders it
 * (`node/template/runtime/src/signature/text/summary/`): the call's name, the
 * recipient and amount of the calls that move ORB, what the staking and nomination pool
 * calls bond, pay to and back, when the transaction expires, its nonce, and a non-zero
 * tip. Any
 * difference from the runtime's rendering makes the signature a `BadProof`; the shared
 * vectors pin both sides.
 */
import { blake2b } from '@noble/hashes/blake2.js';
import { compactBn, u128, u32 } from '@polkadot-api/substrate-bindings';
import { toHex } from '../../../foundation/encoding/hex';

/** A call's pallet and function, as the runtime metadata names them. */
export interface CallName {
    pallet: string;
    call: string;
}

/** A `key: value` line under `action:`. */
type Line = [key: string, value: string];

/** The call's arguments start after its pallet and call indices. */
const ARGS = 2;
const ACCOUNT_ID = 32;
const U32 = 4;
const U128 = 16;

const ORB_DECIMALS = 18;

/** A `Perbill` (parts per 10^9) as a percentage without trailing zeros: `12.5%`. */
export function formatPercent(parts: number): string {
    const fraction = String(parts % 10_000_000)
        .padStart(7, '0')
        .replace(/0+$/, '');
    return `${Math.floor(parts / 10_000_000)}${fraction ? `.${fraction}` : ''}%`;
}

/** `amount` with ORB's 18 decimals and no unit (`1.5`, `2`), as pool points are shown. */
function formatUnits(amount: bigint): string {
    const unit = 10n ** BigInt(ORB_DECIMALS);
    const fraction = (amount % unit).toString().padStart(ORB_DECIMALS, '0').replace(/0+$/, '');
    return `${amount / unit}${fraction ? `.${fraction}` : ''}`;
}

/** `amount` in ORB: the whole part, then the fraction without trailing zeros. */
export function formatOrb(amount: bigint): string {
    return `${formatUnits(amount)} ORB`;
}

/**
 * A 32-byte value's first and last eight bytes around an ellipsis
 * (`0x1c1c1c1c1c1c1c1c…1c1c1c1c1c1c1c1c`), as the signed text shows a shield's commitment.
 */
export function textFingerprint(bytes: Uint8Array): string {
    return `${toHex(bytes.slice(0, 8))}…${toHex(bytes.slice(24, 32)).slice(2)}`;
}

/** `textFingerprint` of `blake2_256(bytes)`, as the signed text shows a memo or a remark. */
export function textHashFingerprint(bytes: Uint8Array): string {
    return textFingerprint(blake2b(bytes, { dkLen: 32 }));
}

/** Bytes taken by the SCALE compact integer at the start of `bytes`. */
function compactLength(bytes: Uint8Array): number {
    const first = bytes[0] ?? 0;
    const mode = first & 0b11;
    return mode === 3 ? (first >> 2) + 5 : 1 << mode;
}

/** A SCALE `Vec<u8>` at the start of `bytes`: its contents, without the length prefix. */
function byteVec(bytes: Uint8Array): Uint8Array {
    const start = compactLength(bytes);
    return bytes.slice(start, start + Number(compactBn.dec(bytes)));
}

/** Most accounts a text-signed `nominate` (staking's or a pool's) or `kick` may list (`MaxNominations`). */
export const MAX_LISTED_ACCOUNTS = 16;

const PERBILL_MAX = 1_000_000_000;

const yesNo = (flag: boolean) => (flag ? 'yes' : 'no');
/** Bytes 20..32 of an EVM account (`[address | 0x00×12]`). */
const EVM_ACCOUNT_MARKER = 12;

/**
 * An account: an EVM account as its 20-byte address, the way its owner knows it, any other in full.
 * The lengths differ, so an account sharing an EVM address's first 20 bytes never looks like it.
 */
function account(bytes: Uint8Array, at = 0): string {
    const id = bytes.slice(at, at + ACCOUNT_ID);
    const evm = id.slice(ACCOUNT_ID - EVM_ACCOUNT_MARKER).every((b) => b === 0);
    return toHex(evm ? id.slice(0, ACCOUNT_ID - EVM_ACCOUNT_MARKER) : id);
}

/** A 32-byte public key, in full. */
const key = (bytes: Uint8Array, at = 0) => toHex(bytes.slice(at, at + ACCOUNT_ID));
const poolLine = (args: Uint8Array): Line => ['pool', String(u32.dec(args))];
const memberLine = (args: Uint8Array): Line => ['member', account(args)];

/** Where a staker's rewards go (`RewardDestination`); null for a variant the runtime does not decode. */
function rewardsTo(bytes: Uint8Array): string | null {
    switch (bytes[0]) {
        case 0:
            return 'staked';
        case 1:
            return 'stash';
        case 2:
            return 'controller';
        case 3:
            return bytes.length >= 1 + ACCOUNT_ID ? account(bytes, 1) : null;
        case 4:
            return 'none';
        default:
            return null;
    }
}

/** A SCALE `Vec<AccountId32>` as one line each, or null past `MAX_LISTED_ACCOUNTS` or the bytes. */
function accountLines(key: string, args: Uint8Array): Line[] | null {
    const count = compactBn.dec(args);
    const start = compactLength(args);
    if (count > BigInt(MAX_LISTED_ACCOUNTS) || start + Number(count) * ACCOUNT_ID > args.length) {
        return null;
    }
    return Array.from({ length: Number(count) }, (_, i): Line => [
        key,
        account(args, start + i * ACCOUNT_ID),
    ]);
}

/** What a pool bond adds (`BondExtra`): an amount from the free balance, or `rewards`. */
function bondExtra(bytes: Uint8Array): string | null {
    switch (bytes[0]) {
        case 0:
            return formatOrb(u128.dec(bytes.slice(1, 1 + U128)));
        case 1:
            return 'rewards';
        default:
            return null;
    }
}

const POOL_STATES = ['open', 'blocked', 'destroying'];
const CLAIM_PERMISSIONS = [
    'permissioned',
    'permissionless compound',
    'permissionless withdraw',
    'permissionless all',
];

/** `lines` with `value` appended as `key`, or null when either is missing. */
const withLine = (lines: Line[], key: string, value: string | null | undefined): Line[] | null =>
    value == null ? null : [...lines, [key, value]];

/**
 * What the staking calls bond, pay to and back: the compact amount and the
 * `RewardDestination` of `bond`, the amount of `bond_extra`/`unbond`/`rebond`, every
 * `nominate` target and `kick`ed nominator, the `validate` prefs (compact `Perbill`,
 * then `blocked`), and the validator, era and page of a payout. `chill` and
 * `withdraw_unbonded` have nothing to show. Null for any other call.
 */
function stakingDetails(args: Uint8Array, fn: string): Line[] | null {
    const amount = (): Line => ['amount', formatOrb(compactBn.dec(args))];
    switch (fn) {
        case 'bond':
            return withLine([amount()], 'rewards to', rewardsTo(args.slice(compactLength(args))));
        case 'bond_extra':
        case 'unbond':
        case 'rebond':
            return [amount()];
        case 'set_payee':
            return withLine([], 'rewards to', rewardsTo(args));
        case 'nominate':
            return accountLines('validator', args);
        case 'kick':
            return accountLines('nominator', args);
        case 'validate': {
            const parts = compactBn.dec(args);
            if (parts > BigInt(PERBILL_MAX)) return null;
            const lines: Line[] = [['commission', formatPercent(Number(parts))]];
            if (args[compactLength(args)] === 1) lines.push(['blocked', 'yes']);
            return lines;
        }
        case 'payout_stakers':
        case 'payout_stakers_by_page': {
            const lines: Line[] = [
                ['validator', account(args)],
                ['era', String(u32.dec(args.slice(ACCOUNT_ID)))],
            ];
            if (fn === 'payout_stakers_by_page') {
                lines.push(['page', String(u32.dec(args.slice(ACCOUNT_ID + U32)))]);
            }
            return lines;
        }
        case 'chill':
        case 'withdraw_unbonded':
            return [];
        default:
            return null;
    }
}

/** A SCALE `Perbill` (`u32`, not compact) as a percentage; null past 100%, as the runtime refuses it. */
function perbill(bytes: Uint8Array): string | null {
    const parts = u32.dec(bytes);
    return parts > PERBILL_MAX ? null : formatPercent(parts);
}

/** Who may claim a pool's commission besides its root (`Option<CommissionClaimPermission>`). */
function commissionClaimPermission(bytes: Uint8Array): string | null {
    if (bytes.length === 1 && bytes[0] === 0) return 'root only';
    if (bytes.length === 2 && bytes[0] === 1 && bytes[1] === 0) return 'permissionless';
    if (bytes.length === 2 + ACCOUNT_ID && bytes[0] === 1 && bytes[1] === 1) {
        return account(bytes, 2);
    }
    return null;
}

/**
 * The commission calls of a pool's root, after the `u32` pool id; null for bytes that are
 * not exactly the call. `set_commission` takes `Option<(Perbill, AccountId32)>`: the rate
 * and its payee, who receives every later claim, or `none`; `set_commission_change_rate`
 * a `Perbill` then a `u32` block count.
 */
function commissionDetails(args: Uint8Array, fn: string): Line[] | null {
    const pool = poolLine(args);
    const rest = args.slice(U32);
    switch (fn) {
        case 'set_commission': {
            if (rest.length === 1 && rest[0] === 0) return [pool, ['commission', 'none']];
            const rate =
                rest.length === 1 + U32 + ACCOUNT_ID && rest[0] === 1
                    ? perbill(rest.slice(1))
                    : null;
            return rate === null
                ? null
                : [pool, ['commission', rate], ['payee', account(rest, 1 + U32)]];
        }
        case 'set_commission_max': {
            const max = rest.length === U32 ? perbill(rest) : null;
            return max === null ? null : [pool, ['max commission', max]];
        }
        case 'set_commission_change_rate': {
            const maxIncrease = rest.length === 2 * U32 ? perbill(rest) : null;
            return maxIncrease === null
                ? null
                : [
                      pool,
                      ['max increase', maxIncrease],
                      ['min delay', `${u32.dec(rest.slice(U32))} blocks`],
                  ];
        }
        case 'claim_commission':
            return rest.length === 0 ? [pool] : null;
        case 'set_commission_claim_permission': {
            const permission = commissionClaimPermission(rest);
            return permission === null ? null : [pool, ['permission', permission]];
        }
        default:
            return null;
    }
}

/**
 * The nomination pool calls a text signature may authorise: the member calls (join, bond
 * more, claim, leave) and the operator calls that bond, nominate, set the pool's state or
 * manage its commission. Metadata and role changes are not text-signable. Pool ids are
 * `u32`; amounts after an account are compact, as staking's.
 */
function poolsDetails(args: Uint8Array, fn: string): Line[] | null {
    switch (fn) {
        case 'join': {
            const amount = formatOrb(compactBn.dec(args));
            return [poolLine(args.slice(compactLength(args))), ['amount', amount]];
        }
        case 'bond_extra':
            return withLine([], 'amount', bondExtra(args));
        case 'bond_extra_other':
            return withLine([memberLine(args)], 'amount', bondExtra(args.slice(ACCOUNT_ID)));
        case 'claim_payout':
            return [];
        case 'claim_payout_other':
        case 'withdraw_unbonded':
            return [memberLine(args)];
        case 'unbond':
            // Points, not ORB: a pool's points track its balance 1:1 until a slash.
            return [
                memberLine(args),
                ['points', formatUnits(compactBn.dec(args.slice(ACCOUNT_ID)))],
            ];
        case 'pool_withdraw_unbonded':
        case 'chill':
            return [poolLine(args)];
        case 'create': {
            const at = compactLength(args);
            return [
                ['amount', formatOrb(compactBn.dec(args))],
                ['root', account(args, at)],
                ['nominator', account(args, at + ACCOUNT_ID)],
                ['bouncer', account(args, at + 2 * ACCOUNT_ID)],
            ];
        }
        case 'nominate': {
            const validators = accountLines('validator', args.slice(U32));
            return validators && [poolLine(args), ...validators];
        }
        case 'set_state':
            return withLine([poolLine(args)], 'state', POOL_STATES[args[U32] ?? -1]);
        case 'set_claim_permission':
            return withLine([], 'permission', CLAIM_PERMISSIONS[args[0] ?? -1]);
        default:
            return args.length >= U32 ? commissionDetails(args, fn) : null;
    }
}

/**
 * The lines of a call a text signature may authorise, or null for any other call (as
 * the runtime's `summary::details`):
 * - transfers: an `AccountId32` then a compact balance (`transfer_all`: then `keep_alive`);
 * - ORB shields (amount, then the commitment's and the memo's fingerprints) and fee
 *   claims: a `u32` asset (0 only) then a `u128` amount;
 * - the staking and nomination pool calls above;
 * - `Session.set_keys`: the Aura then the GRANDPA key;
 * - `System.remark`: its length and fingerprint;
 * - calls with nothing to show (`Session.purge_keys`, `ValidatorSet.deregister_validator`).
 */
function details(call: Uint8Array, { pallet, call: fn }: CallName): Line[] | null {
    const args = call.slice(ARGS);
    const recipient = (): Line => ['to', account(args)];
    switch (`${pallet}.${fn}`) {
        case 'Balances.transfer_allow_death':
        case 'Balances.transfer_keep_alive':
            return [recipient(), ['amount', formatOrb(compactBn.dec(args.slice(ACCOUNT_ID)))]];
        case 'Balances.transfer_all':
            return [recipient(), ['amount', 'all'], ['keep alive', yesNo(args[ACCOUNT_ID] === 1)]];
        case 'ShieldedPool.shield': {
            if (u32.dec(args) !== 0) return null;
            const commitment = U32 + U128;
            return [
                ['amount', formatOrb(u128.dec(args.slice(U32)))],
                ['commitment', textFingerprint(args.slice(commitment, commitment + 32))],
                ['memo', textHashFingerprint(byteVec(args.slice(commitment + 32)))],
            ];
        }
        case 'ShieldedPool.claim_fees':
            return u32.dec(args) === 0 ? [['amount', formatOrb(u128.dec(args.slice(U32)))]] : null;
        case 'Session.set_keys':
            return [
                ['aura key', key(args)],
                ['grandpa key', key(args, ACCOUNT_ID)],
            ];
        case 'System.remark': {
            const remark = byteVec(args);
            return [
                ['length', `${remark.length} bytes`],
                ['remark', textHashFingerprint(remark)],
            ];
        }
        case 'Session.purge_keys':
        case 'ValidatorSet.deregister_validator':
            return [];
        default:
            if (pallet === 'Staking') return stakingDetails(args, fn);
            if (pallet === 'NominationPools') return poolsDetails(args, fn);
            return null;
    }
}

/**
 * The `expires:` value of a SCALE `Era` (`CheckMortality`): `never`, or `within {period}
 * blocks` of the block it was signed against. Null for bytes that are no era, as the
 * runtime then shows neither expiry, nonce nor tip.
 */
export function textExpiry(era: Uint8Array): string | null {
    if (era[0] === 0) return 'never';
    if (era.length < 2) return null;
    const encoded = (era[0] ?? 0) | ((era[1] ?? 0) << 8);
    const period = 2 << (encoded % 16);
    const phase = (encoded >> 4) * Math.max(period >> 12, 1);
    return period >= 4 && phase < period ? `within ${period} blocks` : null;
}

/**
 * Whether a text signature may authorise `call`: only calls whose lines show every
 * parameter that moves value or authority. The runtime refuses any other call, so a
 * signer refuses to sign it rather than show a text that hides what it does.
 */
export function isTextSignable(call: Uint8Array, name: CallName | null): boolean {
    return name !== null && details(call, name) !== null;
}

/**
 * The `action:` value and the lines under it: the call's lines, then `expires:` from
 * `era` (the payload's `CheckMortality` bytes), the payload's `nonce`, then a non-zero
 * tip. `name` is `null` for bytes that are no call.
 */
export function summaryLines(
    call: Uint8Array,
    name: CallName | null,
    tip: bigint,
    era: Uint8Array,
    nonce: bigint
): string {
    if (!name) return 'unknown';
    // A call that is not text-signable still renders its name, as the runtime does.
    const lines = details(call, name) ?? [];
    const expires = textExpiry(era);
    if (expires !== null) {
        lines.push(['expires', expires], ['nonce', String(nonce)]);
        if (tip !== 0n) lines.push(['tip', formatOrb(tip)]);
    }
    return [`${name.pallet}.${name.call}`, ...lines.map(([k, v]) => `${k}: ${v}`)].join('\n');
}
