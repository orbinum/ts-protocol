/**
 * The runtime's `BoundAction` (`configs::stacks::privacy::BoundAction`) as PAPI's
 * metadata-driven API takes it, its SCALE encoding — what a bound spend's proof binds —
 * and the action read back from a call argument. Each action's fields are its module's.
 */
import { Variant } from '@polkadot-api/substrate-bindings';
import { fromHex, toHex } from '../../../foundation/encoding/hex';
import { checkBoundAction } from './check';
import { readVariant } from '../fields/index';
import { privateCallCodec, privateCallFields, readPrivateCall } from '../privateCall/index';
import {
    privateStakingCodec,
    privateStakingFields,
    readPrivateStaking,
} from '../privateStaking/index';
import type { BoundAction } from './types';

const boundActionCodec = Variant({
    PrivateStaking: privateStakingCodec,
    PrivateCall: privateCallCodec,
});

/**
 * The action with the runtime's field names, checked. `key` renders the 32-byte keys and
 * `address` a private call step's 20-byte target.
 */
function withFieldNames<K, A>(
    action: BoundAction,
    key: (bytes: Uint8Array) => K,
    address: (hex: string) => A
) {
    checkBoundAction(action);
    return action.type === 'PrivateCall'
        ? { type: 'PrivateCall' as const, value: privateCallFields(action.value, key, address) }
        : { type: 'PrivateStaking' as const, value: privateStakingFields(action.value, key) };
}

/**
 * The action as a call argument: PAPI takes a fixed-size byte array (`[u8; 32]`, an
 * `H160`) as hex and a `Vec<u8>` as bytes.
 */
export function boundActionArg(action: BoundAction) {
    return withFieldNames(action, toHex, (hex) => hex);
}

/** SCALE encoding of the action, from its raw bytes (the codec mis-encodes hex). */
export function encodeBoundAction(action: BoundAction): Uint8Array {
    return boundActionCodec.enc(withFieldNames(action, (bytes) => bytes, fromHex) as never);
}

/**
 * A bound spend's `action` argument read back — as PAPI decodes it, or as its JSON (bytes
 * as hex, amounts as decimal text) — or null when it is not a valid `BoundAction`.
 */
export function decodeBoundAction(raw: unknown): BoundAction | null {
    const outer = readVariant(raw);
    let action: BoundAction | null = null;
    if (outer?.type === 'PrivateStaking') {
        const value = readPrivateStaking(outer.value);
        action = value && { type: 'PrivateStaking', value };
    } else if (outer?.type === 'PrivateCall') {
        const value = readPrivateCall(outer.value);
        action = value && { type: 'PrivateCall', value };
    }
    if (!action) return null;
    try {
        return checkBoundAction(action);
    } catch {
        return null;
    }
}
