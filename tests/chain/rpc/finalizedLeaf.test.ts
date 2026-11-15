/**
 * The finalized lookup: `ShieldedPool.CommitmentToLeafIndex` read at the
 * finalized head. The key must be exactly the runtime's, or every lookup reads
 * an empty slot and every payment looks unpaid (or, worse, a wrong slot).
 */
import { describe, expect, it, vi } from 'vitest';
import { xxhashAsU8a } from '@polkadot/util-crypto';
import { blake2b } from '@noble/hashes/blake2.js';
import {
    COMMITMENT_TO_LEAF_INDEX_PREFIX,
    commitmentLeafIndexKey,
    decodeLeafIndex,
} from '../../../src/chain/rpc/finalizedLeaf';
import { PrivacyModule } from '../../../src/chain/rpc/PrivacyModule';
import { fromHex, toHex } from '../../../src';

const twox128 = (text: string) => toHex(xxhashAsU8a(text, 128)).slice(2);
/** A commitment that was leaf 0 of the testnet tree (read 2026-11-08). */
const TESTNET_LEAF_0 = '0x2b8a4644f5c556c518c834af34b2fa7d0424aee23223806f3b6a81e7a6e1f700';

describe('commitmentLeafIndexKey', () => {
    it('the prefix is twox128("ShieldedPool") ++ twox128("CommitmentToLeafIndex")', () => {
        // The hash itself, checked on a constant every Substrate chain shares.
        expect(`0x${twox128('System')}${twox128('Account')}`).toBe(
            '0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9'
        );
        expect(COMMITMENT_TO_LEAF_INDEX_PREFIX).toBe(
            `0x${twox128('ShieldedPool')}${twox128('CommitmentToLeafIndex')}`
        );
    });

    it('appends Blake2_128Concat of the commitment’s raw bytes', () => {
        const c = fromHex(TESTNET_LEAF_0);
        expect(commitmentLeafIndexKey(TESTNET_LEAF_0)).toBe(
            COMMITMENT_TO_LEAF_INDEX_PREFIX +
                toHex(blake2b(c, { dkLen: 16 })).slice(2) +
                TESTNET_LEAF_0.slice(2)
        );
    });

    it('refuses anything but a 32-byte hex commitment', () => {
        for (const bad of ['', '0x00', TESTNET_LEAF_0 + '00', TESTNET_LEAF_0.slice(2), 42]) {
            expect(() => commitmentLeafIndexKey(bad as never)).toThrow(TypeError);
        }
    });
});

describe('decodeLeafIndex', () => {
    it('reads a SCALE u32; absent is null', () => {
        expect(decodeLeafIndex('0x00000000')).toBe(0);
        expect(decodeLeafIndex('0x05010000')).toBe(261);
        expect(decodeLeafIndex(null)).toBeNull();
    });

    it('anything else throws: a malformed answer is never "not paid"', () => {
        for (const bad of ['0x', '0x0500', '0x0500000000', 'nope', undefined, 5]) {
            expect(() => decodeLeafIndex(bad as never)).toThrow();
        }
    });
});

describe('PrivacyModule.getFinalizedLeafIndex', () => {
    const FINALIZED = '0x' + 'fa'.repeat(32);
    const module = (answers: Record<string, unknown>) => {
        const request = vi.fn(async (method: string) => answers[method]);
        return { request, privacy: new PrivacyModule({ request } as never) };
    };

    it('reads the map at the finalized head, not the best block', async () => {
        const { request, privacy } = module({
            chain_getFinalizedHead: FINALIZED,
            state_getStorage: '0x07000000',
        });
        expect(await privacy.getFinalizedLeafIndex(TESTNET_LEAF_0)).toBe(7);
        expect(request).toHaveBeenCalledWith('state_getStorage', [
            commitmentLeafIndexKey(TESTNET_LEAF_0),
            FINALIZED,
        ]);
    });

    it('an absent entry is null', async () => {
        const { privacy } = module({ chain_getFinalizedHead: FINALIZED, state_getStorage: null });
        expect(await privacy.getFinalizedLeafIndex(TESTNET_LEAF_0)).toBeNull();
    });

    it('a malformed finalized head throws, and storage is never read', async () => {
        const { request, privacy } = module({
            chain_getFinalizedHead: '0x1234',
            state_getStorage: '0x07000000',
        });
        await expect(privacy.getFinalizedLeafIndex(TESTNET_LEAF_0)).rejects.toThrow(
            /finalized head/
        );
        expect(request).not.toHaveBeenCalledWith('state_getStorage', expect.anything());
    });
});
