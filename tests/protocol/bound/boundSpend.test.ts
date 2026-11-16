import { describe, it, expect } from 'vitest';
import { blake2b } from '@noble/hashes/blake2.js';
import {
    boundActionArg,
    decodeBoundAction,
    BOUND_SPEND_DOMAIN,
    boundSpendDigest,
    encodeBoundAction,
    type BoundAction,
} from '../../../src/protocol/bound/index';
import { BN254_R } from '../../../src/foundation/crypto/constants';
import { bytesToBigintLE } from '../../../src/foundation/encoding/bytes';
import { fromHex, toHex } from '../../../src/foundation/encoding/hex';

const key = (b: number) => new Uint8Array(32).fill(b);
const enter = (minShares = 7n): BoundAction => ({
    type: 'PrivateStaking',
    value: { type: 'Enter', value: { poolId: 3, ownerPk: key(1), blinding: key(2), minShares } },
});
const GENESIS = '0x43d1d3b788a8dc28082f5c0537d637225dbd1bede574182783207bb3afae200a';

describe('encodeBoundAction', () => {
    it('encodes as the runtime does (polkadot.js against spec 22 metadata)', () => {
        expect(toHex(encodeBoundAction(enter()))).toBe(
            '0x00000300000001010101010101010101010101010101010101010101010101010101010101010202020202020202020202020202020202020202020202020202020202020202' +
                '07000000000000000000000000000000'
        );
    });

    it('tags an exit as variant 1 and carries min_value', () => {
        const exit: BoundAction = {
            type: 'PrivateStaking',
            value: {
                type: 'Exit',
                value: { poolId: 1, ownerPk: key(1), blinding: key(2), minValue: 1n },
            },
        };
        const bytes = encodeBoundAction(exit);
        expect(Array.from(bytes.slice(0, 6))).toEqual([0, 1, 1, 0, 0, 0]);
        expect(bytes[bytes.length - 16]).toBe(1);
        expect(bytes.length).toBe(2 + 4 + 64 + 16);
    });
});

describe('bound action checks', () => {
    const withKey = (ownerPk: Uint8Array): BoundAction => ({
        type: 'PrivateStaking',
        value: { type: 'Enter', value: { poolId: 3, ownerPk, blinding: key(2), minShares: 0n } },
    });

    it('refuses what the runtime would, before any proof', () => {
        expect(() => encodeBoundAction(withKey(new Uint8Array(31).fill(1)))).toThrow(/32 bytes/);
        expect(() => encodeBoundAction(withKey(new Uint8Array(32)))).toThrow(/field element/);
        expect(() => encodeBoundAction(withKey(new Uint8Array(32).fill(0xff)))).toThrow(
            /field element/
        );
        expect(() => encodeBoundAction(enter(-1n))).toThrow(/u128/);
        expect(() => encodeBoundAction(enter(1n << 128n))).toThrow(/u128/);
    });
});

describe('boundSpendDigest', () => {
    /** The runtime's preimage, assembled by hand: domain ‖ genesis ‖ H(action) ‖ H(SCALE([memo])). */
    function reference(action: BoundAction, memo: Uint8Array): bigint {
        const h = (b: Uint8Array) => blake2b(b, { dkLen: 32 });
        // SCALE(Vec<Vec<u8>>) of one memo: compact(1), compact(len), bytes.
        const lenPrefix =
            memo.length < 64
                ? [memo.length << 2]
                : [((memo.length << 2) | 1) & 0xff, (memo.length << 2) >> 8];
        const memoList = Uint8Array.from([4, ...lenPrefix, ...memo]);
        const pre = Uint8Array.from([
            ...new TextEncoder().encode(BOUND_SPEND_DOMAIN),
            ...fromHex(GENESIS),
            ...h(encodeBoundAction(action)),
            ...h(memoList),
        ]);
        return bytesToBigintLE(h(pre)) % BN254_R;
    }

    it('matches the runtime preimage for a total spend (empty memo)', () => {
        expect(boundSpendDigest(GENESIS, enter(), new Uint8Array())).toBe(
            reference(enter(), new Uint8Array())
        );
    });

    it('matches the runtime preimage with a 180-byte change memo', () => {
        const memo = new Uint8Array(180).fill(9);
        expect(boundSpendDigest(GENESIS, enter(), memo)).toBe(reference(enter(), memo));
    });

    it('binds the action, the chain and the memo', () => {
        const base = boundSpendDigest(GENESIS, enter(), new Uint8Array());
        expect(boundSpendDigest(GENESIS, enter(8n), new Uint8Array())).not.toBe(base);
        expect(boundSpendDigest('0x' + '00'.repeat(32), enter(), new Uint8Array())).not.toBe(base);
        expect(boundSpendDigest(GENESIS, enter(), new Uint8Array(1))).not.toBe(base);
        expect(base < BN254_R).toBe(true);
    });

    it('refuses a genesis hash that is not 32 bytes', () => {
        expect(() => boundSpendDigest('0x00', enter(), [])).toThrow(/32 bytes/);
    });
});

describe('decodeBoundAction', () => {
    it('reads back what the call argument carries, as PAPI or as JSON', () => {
        const action = enter(9n);
        expect(decodeBoundAction(boundActionArg(action))).toEqual(action);
        const json = JSON.parse(
            JSON.stringify(boundActionArg(action), (_k, v) => (typeof v === 'bigint' ? `${v}` : v))
        );
        expect(decodeBoundAction(json)).toEqual(action);
        const papi = boundActionArg(action);
        const fixed = { asBytes: () => action.value.value.ownerPk };
        expect(
            decodeBoundAction({
                ...papi,
                value: { ...papi.value, value: { ...papi.value.value, owner_pk: fixed } },
            })
        ).toEqual(action);
    });

    it('is null for anything that is not a valid action', () => {
        const papi = boundActionArg(enter());
        const body = papi.value.value;
        for (const bad of [
            null,
            { type: 'Other', value: papi.value },
            { ...papi, value: { type: 'Stake', value: body } },
            { ...papi, value: { ...papi.value, value: { ...body, owner_pk: '0x00' } } },
            { ...papi, value: { ...papi.value, value: { ...body, blinding: toHex(key(0)) } } },
            { ...papi, value: { ...papi.value, value: { ...body, min_shares: '-1' } } },
        ]) {
            expect(decodeBoundAction(bad)).toBeNull();
        }
    });
});
