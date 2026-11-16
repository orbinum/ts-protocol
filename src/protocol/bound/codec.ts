/**
 * The runtime's `BoundAction` (`configs::stacks::privacy::BoundAction`) as PAPI's
 * metadata-driven API takes it, and its SCALE encoding — what a bound spend's proof binds.
 */
import { Bytes, Struct, Variant, u128, u32 } from '@polkadot-api/substrate-bindings';
import { BN254_R } from '../../foundation/crypto/constants';
import { bytesToBigintLE } from '../../foundation/encoding/bytes';
import { fromHex, isHexOfLength, toHex } from '../../foundation/encoding/hex';
import type { BoundAction } from './types';

const key32 = Bytes(32);
const boundActionCodec = Variant({
    PrivateStaking: Variant({
        Enter: Struct({ pool_id: u32, owner_pk: key32, blinding: key32, min_shares: u128 }),
        Exit: Struct({ pool_id: u32, owner_pk: key32, blinding: key32, min_value: u128 }),
    }),
});

const U128_MAX = (1n << 128n) - 1n;

/** A non-zero canonical field element in 32 little-endian bytes, as the runtime requires. */
function fieldKey(bytes: Uint8Array, field: string): Uint8Array {
    if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
        throw new Error(`BoundAction.${field}: expected 32 bytes`);
    }
    const n = bytesToBigintLE(bytes);
    if (n === 0n || n >= BN254_R)
        throw new Error(`BoundAction.${field}: not a non-zero field element`);
    return bytes;
}

function checked(action: BoundAction): BoundAction {
    const { type, value } = action.value;
    const min = type === 'Enter' ? value.minShares : value.minValue;
    if (!Number.isInteger(value.poolId) || value.poolId < 0 || value.poolId > 0xffff_ffff) {
        throw new Error(`BoundAction.poolId: expected a uint32, got ${value.poolId}`);
    }
    if (typeof min !== 'bigint' || min < 0n || min > U128_MAX) {
        throw new Error(`BoundAction: minimum out of u128 range, got ${min}`);
    }
    fieldKey(value.ownerPk, 'ownerPk');
    fieldKey(value.blinding, 'blinding');
    return action;
}

/** The action with the runtime's field names, checked; `key` renders the two 32-byte keys. */
function withFieldNames<K>(action: BoundAction, key: (bytes: Uint8Array) => K) {
    const { type, value } = checked(action).value;
    const common = {
        pool_id: value.poolId,
        owner_pk: key(value.ownerPk),
        blinding: key(value.blinding),
    };
    return {
        type: 'PrivateStaking' as const,
        value:
            type === 'Enter'
                ? { type: 'Enter' as const, value: { ...common, min_shares: value.minShares } }
                : { type: 'Exit' as const, value: { ...common, min_value: value.minValue } },
    };
}

/** The action as a call argument: PAPI takes a fixed-size byte array (`[u8; 32]`) as hex. */
export function boundActionArg(action: BoundAction) {
    return withFieldNames(action, toHex);
}

/** SCALE encoding of the action, from its raw key bytes (the codec mis-encodes hex). */
export function encodeBoundAction(action: BoundAction): Uint8Array {
    return boundActionCodec.enc(withFieldNames(action, (bytes) => bytes) as never);
}

/** 32 key bytes from what a decoder hands back: hex, bytes, or PAPI's `FixedSizeBinary`. */
function keyBytes(v: unknown): Uint8Array | null {
    if (v instanceof Uint8Array) return v.length === 32 ? v : null;
    if (typeof v === 'string') return isHexOfLength(v, 32) ? fromHex(v) : null;
    const asBytes = (v as { asBytes?: () => Uint8Array } | null)?.asBytes;
    return typeof asBytes === 'function' ? keyBytes(asBytes.call(v)) : null;
}

function amount(v: unknown): bigint | null {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number' && Number.isSafeInteger(v)) return BigInt(v);
    return typeof v === 'string' && /^\d+$/.test(v) ? BigInt(v) : null;
}

/**
 * A bound spend's `action` argument read back — as PAPI decodes it, or as its JSON (keys
 * as hex, amounts as decimal text) — or null when it is not a valid `BoundAction`.
 */
export function decodeBoundAction(raw: unknown): BoundAction | null {
    const variant = (v: unknown) =>
        v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string'
            ? (v as { type: string; value?: unknown })
            : null;
    const outer = variant(raw);
    const inner = outer?.type === 'PrivateStaking' ? variant(outer.value) : null;
    if (!inner || (inner.type !== 'Enter' && inner.type !== 'Exit')) return null;
    const body = (inner.value ?? {}) as Record<string, unknown>;
    const poolId = Number(body['pool_id']);
    const ownerPk = keyBytes(body['owner_pk']);
    const blinding = keyBytes(body['blinding']);
    const min = amount(body[inner.type === 'Enter' ? 'min_shares' : 'min_value']);
    if (!ownerPk || !blinding || min === null) return null;
    const value =
        inner.type === 'Enter'
            ? { type: 'Enter' as const, value: { poolId, ownerPk, blinding, minShares: min } }
            : { type: 'Exit' as const, value: { poolId, ownerPk, blinding, minValue: min } };
    try {
        return checked({ type: 'PrivateStaking', value });
    } catch {
        return null;
    }
}
