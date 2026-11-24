/** `staking::private::Action`: its SCALE codec, its runtime field names, and reading it back. */
import { Bytes, Struct, Variant, u128, u32 } from '@polkadot-api/substrate-bindings';
import { readAmount, readBytes, readStruct, readVariant } from '../fields/index';
import type { PrivateStakingAction } from './types';

const key32 = Bytes(32);

export const privateStakingCodec = Variant({
    Enter: Struct({ pool_id: u32, owner_pk: key32, blinding: key32, min_shares: u128 }),
    Exit: Struct({ pool_id: u32, owner_pk: key32, blinding: key32, min_value: u128 }),
});

/** The action with the runtime's field names, its keys rendered by `key`. */
export function privateStakingFields<K>(
    action: PrivateStakingAction,
    key: (bytes: Uint8Array) => K
) {
    const { value } = action;
    const common = {
        pool_id: value.poolId,
        owner_pk: key(value.ownerPk),
        blinding: key(value.blinding),
    };
    return action.type === 'Enter'
        ? { type: 'Enter' as const, value: { ...common, min_shares: action.value.minShares } }
        : { type: 'Exit' as const, value: { ...common, min_value: action.value.minValue } };
}

/** The action from its decoded form, or null; not checked. */
export function readPrivateStaking(raw: unknown): PrivateStakingAction | null {
    const inner = readVariant(raw);
    if (!inner || (inner.type !== 'Enter' && inner.type !== 'Exit')) return null;
    const body = readStruct(inner.value);
    const poolId = Number(body['pool_id']);
    const ownerPk = readBytes(body['owner_pk'], 32);
    const blinding = readBytes(body['blinding'], 32);
    const min = readAmount(body[inner.type === 'Enter' ? 'min_shares' : 'min_value']);
    if (!ownerPk || !blinding || min === null) return null;
    return inner.type === 'Enter'
        ? { type: 'Enter', value: { poolId, ownerPk, blinding, minShares: min } }
        : { type: 'Exit', value: { poolId, ownerPk, blinding, minValue: min } };
}
