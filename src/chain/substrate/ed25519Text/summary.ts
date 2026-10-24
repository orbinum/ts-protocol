/**
 * What the signed text shows of a transaction, as the runtime renders it
 * (`node/template/runtime/src/orbinum_signature/text/summary.rs`): the call's name, the
 * recipient and amount of the calls that move ORB, and a non-zero tip. Any difference
 * from the runtime's rendering makes the signature a `BadProof`; the shared vectors pin
 * both sides.
 */
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

const ORB_DECIMALS = 18;

/** `amount` in ORB: the whole part, then the fraction without trailing zeros. */
export function formatOrb(amount: bigint): string {
    const unit = 10n ** BigInt(ORB_DECIMALS);
    const fraction = (amount % unit).toString().padStart(ORB_DECIMALS, '0').replace(/0+$/, '');
    return `${amount / unit}${fraction ? `.${fraction}` : ''} ORB`;
}

/**
 * Recipient and amount of the calls that move ORB, read at their fixed offsets: an
 * `AccountId32` then a compact balance (transfers), or a `u32` asset then a `u128`
 * amount (shield, claim_fees). Other assets have their own decimals and show no amount.
 */
function details(call: Uint8Array, { pallet, call: fn }: CallName): Line[] {
    const recipient = (): Line => ['to', toHex(call.slice(ARGS, ARGS + ACCOUNT_ID))];
    if (pallet === 'Balances') {
        if (fn === 'transfer_allow_death' || fn === 'transfer_keep_alive') {
            return [
                recipient(),
                ['amount', formatOrb(compactBn.dec(call.slice(ARGS + ACCOUNT_ID)))],
            ];
        }
        if (fn === 'transfer_all') return [recipient(), ['amount', 'all']];
    }
    if (pallet === 'ShieldedPool' && (fn === 'shield' || fn === 'claim_fees')) {
        if (u32.dec(call.slice(ARGS)) === 0) {
            return [['amount', formatOrb(u128.dec(call.slice(ARGS + U32)))]];
        }
    }
    return [];
}

/** The `action:` value and the lines under it. `name` is `null` for bytes that are no call. */
export function summaryLines(call: Uint8Array, name: CallName | null, tip: bigint): string {
    if (!name) return 'unknown';
    const lines = details(call, name);
    if (tip !== 0n) lines.push(['tip', formatOrb(tip)]);
    return [`${name.pallet}.${name.call}`, ...lines.map(([k, v]) => `${k}: ${v}`)].join('\n');
}
