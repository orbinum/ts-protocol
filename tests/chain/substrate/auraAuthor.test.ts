/**
 * Block author derivation.
 *
 * The chain runs Aura, whose PreRuntime digest carries ONLY the slot — 14 bytes.
 * The author is not in the header: it is derived from `slot % validatorCount`
 * against the session's validator set, which is ordered like Aura.Authorities.
 *
 * This suite exists because the indexer's original code (and this package's own
 * `extractAuthorFromLogs`, since removed) assumed the BABE layout (slot +
 * a 32-byte authority pubkey) and sliced bytes 13..45 out of a 14-byte log. It
 * silently returned undefined for every block ever indexed, and nothing caught
 * it — the genesis block legitimately has no author, which made the null look
 * expected.
 *
 * Fixtures are real testnet data (block 89), moved here from the indexer.
 */
import { describe, it, expect } from 'vitest';
import { auraSlot, authorFromSlot } from '../../../src/chain/substrate/blockInfo';

// Block 89's actual digest logs, verbatim from chain_getBlock.
const AURA_PRERUNTIME = '0x066175726120e65ab91100000000';
const FRONTIER_LOG = '0x0466726f6e8801b951a2e0613b22e382950010887d479ab8e667a1a085';
const AURA_SEAL = '0x056175726101018a16a5b4957431d9289798be81c2fca9484724868ba7';
const BLOCK_89_SLOT = 297360102n;

// Session.Validators at block 89, in order. ValidatorId = AccountId in the
// runtime (identity mapping), so these are the accounts the validators table is
// keyed by — no Session.KeyOwner indirection.
const VALIDATORS = [
    '0xb873599c026d0066aebe213d7984e7f84a6e3425d39f5fafcf681528a555ce47',
    '0x641a682160d6298090cf1b1998dc3dad0c3df962fd29728fa1f7d3253c260362',
    '0x0e24a46982207bc39fb1aa11724e127784b0b155330680583170a50fcd2bd052',
];

describe('auraSlot', () => {
    it('decodes the slot from a real Aura PreRuntime digest', () => {
        expect(auraSlot([AURA_PRERUNTIME, FRONTIER_LOG, AURA_SEAL])).toBe(BLOCK_89_SLOT);
    });

    it('finds the PreRuntime log regardless of position', () => {
        expect(auraSlot([FRONTIER_LOG, AURA_SEAL, AURA_PRERUNTIME])).toBe(BLOCK_89_SLOT);
    });

    // Genesis has no digest at all — it was not authored by anyone.
    it('returns null when there is no digest', () => {
        expect(auraSlot([])).toBeNull();
    });

    // The Seal (05) is also an aura log and sits right next to the PreRuntime one.
    // Matching on the engine alone would pick it up and decode garbage as a slot.
    it('ignores the Aura Seal, which is not a PreRuntime digest', () => {
        expect(auraSlot([AURA_SEAL])).toBeNull();
    });

    it('ignores a PreRuntime log from another consensus engine', () => {
        // 06 + "BABE" + payload — right digest type, wrong engine.
        expect(auraSlot(['0x0642414245' + '20' + 'e65ab91100000000'])).toBeNull();
    });

    it('ignores a truncated PreRuntime log rather than decoding a partial slot', () => {
        expect(auraSlot(['0x066175726120e65ab9'])).toBeNull();
    });

    it('decodes the u64 as little-endian', () => {
        // slot 1 → 01 followed by seven zero bytes.
        expect(auraSlot(['0x0661757261200100000000000000'])).toBe(1n);
    });
});

describe('authorFromSlot', () => {
    // The load-bearing case: block 89, slot 297360102, 3 validators → index 0.
    // Its evm_miner was 0x026d0066…, which is embedded in validator[0]'s AccountId.
    it('derives the real author of testnet block 89', () => {
        expect(authorFromSlot(BLOCK_89_SLOT, VALIDATORS)).toBe(VALIDATORS[0]);
    });

    it('assigns slots round-robin across the set', () => {
        expect(authorFromSlot(0n, VALIDATORS)).toBe(VALIDATORS[0]);
        expect(authorFromSlot(1n, VALIDATORS)).toBe(VALIDATORS[1]);
        expect(authorFromSlot(2n, VALIDATORS)).toBe(VALIDATORS[2]);
        expect(authorFromSlot(3n, VALIDATORS)).toBe(VALIDATORS[0]);
    });

    // Slots are u64 and long past 2^53 on a live chain — the modulo must stay in
    // bigint, or the index is computed from a rounded float.
    it('handles slots beyond Number.MAX_SAFE_INTEGER', () => {
        const huge = 9_007_199_254_740_993n; // 2^53 + 1
        expect(authorFromSlot(huge, VALIDATORS)).toBe(VALIDATORS[Number(huge % 3n)]);
    });

    // Both are "we do not know" — attributing a block to the wrong validator is
    // worse than leaving it null.
    it('returns null rather than guessing when inputs are missing', () => {
        expect(authorFromSlot(null, VALIDATORS)).toBeNull();
        expect(authorFromSlot(BLOCK_89_SLOT, [])).toBeNull();
    });
});
