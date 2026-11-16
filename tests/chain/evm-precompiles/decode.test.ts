import { describe, it, expect } from 'vitest';
import { decodePrecompileCalldata } from '../../../src/chain/evm/precompiles/decode';
import { buildShieldCalldata } from '../../../src/chain/evm/precompiles/shieldedPoolCalldata';
import { PRECOMPILE_ADDR } from '../../../src/chain/evm/precompiles/addresses';
import type { ShieldParams } from '../../../src/chain/pallet/shielded-pool/types/index';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SP_ADDR = PRECOMPILE_ADDR.SHIELDED_POOL;

const COMMITMENT = '0x' + 'aa'.repeat(32);

/** A stand-in shield proof: the calls carry it, nothing here verifies it. */
const SHIELD_PROOF = new Uint8Array(128).fill(1);

function shieldCalldata(overrides: Partial<ShieldParams> = {}): string {
    return buildShieldCalldata({
        assetId: 0,
        amount: 1_000n,
        commitment: COMMITMENT,
        encryptedMemo: new Uint8Array(180),
        proof: SHIELD_PROOF,
        circuitVersion: 1,
        ...overrides,
    });
}

// ─── Null / edge cases ────────────────────────────────────────────────────────

describe('decodePrecompileCalldata — null cases', () => {
    it('returns null for an unknown address', () => {
        expect(decodePrecompileCalldata('0xdeadbeef', '0x12345678')).toBeNull();
    });

    it('returns null for empty input', () => {
        expect(decodePrecompileCalldata(SP_ADDR, '')).toBeNull();
    });

    it('returns null for input shorter than 10 chars', () => {
        expect(decodePrecompileCalldata(SP_ADDR, '0x1234')).toBeNull();
    });

    it('returns null when selector is not registered', () => {
        expect(
            decodePrecompileCalldata(SP_ADDR, '0x' + 'ff'.repeat(4) + '00'.repeat(32))
        ).toBeNull();
    });

    it('is case-insensitive on address', () => {
        const result = decodePrecompileCalldata(SP_ADDR.toUpperCase(), shieldCalldata());
        expect(result).not.toBeNull();
        expect(result?.fnSig).toMatch(/^shield\(/);
    });
});

// ─── shield(uint32,bytes32,bytes,bytes,uint32) — round-trip ──────────────────
// amount is msg.value (NOT in calldata)

describe('decodePrecompileCalldata — shield', () => {
    it('decodes fnSig and method', () => {
        const calldata = shieldCalldata();
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(calldata.slice(0, 10)).toBe('0xf25897e0');
        expect(result?.fnSig).toBe('shield(uint32,bytes32,bytes,bytes,uint32)');
        expect(result?.method).toBe('shield');
    });

    it('decodes the circuit version', () => {
        const result = decodePrecompileCalldata(SP_ADDR, shieldCalldata({ circuitVersion: 4 }));
        expect(result?.args['circuitVersion']).toBe(4n);
    });

    it('round-trips assetId', () => {
        const result = decodePrecompileCalldata(SP_ADDR, shieldCalldata({ assetId: 7 }));
        expect(result?.args['assetId']).toBe(7n);
    });

    it('amount is NOT present in args (it is msg.value)', () => {
        const calldata = shieldCalldata({ amount: 1_000_000_000_000_000_000n });
        expect(decodePrecompileCalldata(SP_ADDR, calldata)?.args['amount']).toBeUndefined();
    });

    it('round-trips commitment as 0x-prefixed hex', () => {
        const result = decodePrecompileCalldata(SP_ADDR, shieldCalldata());
        expect(typeof result?.args['commitment']).toBe('string');
        expect((result?.args['commitment'] as string).toLowerCase()).toBe(COMMITMENT.toLowerCase());
    });
});

// ─── Truncated calldata is not a source of invented values ───────────────────
//
// This decoder reads calldata taken FROM THE CHAIN, so its input is whatever
// anyone chose to submit — including a call that was never valid. `decodeUint`
// reads a fixed 32-byte window and substitutes `?? 0` for bytes past the end,
// so a half-present field is completed with zeros and returns a number nobody
// encoded.

describe('decodePrecompileCalldata — truncated input', () => {
    /** A well-formed call, cut to `bytes` of payload after the selector. */
    function truncate(fullCalldata: string, bytes: number): string {
        return fullCalldata.slice(0, 10 + bytes * 2);
    }

    it('does not report a circuit version when its slot is cut in half', () => {
        // The circuit_version slot is [128,160): half of it plus substituted
        // zeros would decode to a version the sender never wrote.
        const decoded = decodePrecompileCalldata(SP_ADDR, truncate(shieldCalldata(), 144));
        expect(decoded?.args['circuitVersion']).toBeUndefined();
    });

    it('reports no fields when the head is incomplete', () => {
        const decoded = decodePrecompileCalldata(SP_ADDR, truncate(shieldCalldata(), 100));
        expect(decoded?.args).toEqual({});
    });

    it('still names the method for a truncated call', () => {
        // Losing the args must not lose the classification: the UI can still
        // label the row, it just has no values to show.
        const decoded = decodePrecompileCalldata(SP_ADDR, truncate(shieldCalldata(), 40));
        expect(decoded?.method).toBe('shield');
    });

    it('decodes every field when the calldata is complete', () => {
        const decoded = decodePrecompileCalldata(SP_ADDR, shieldCalldata({ assetId: 3 }));
        expect(decoded?.args).toEqual({
            assetId: 3n,
            commitment: COMMITMENT,
            circuitVersion: 1n,
        });
    });
});

describe('decodePrecompileCalldata — Balances transfers', () => {
    const BALANCES = '0x0000000000000000000000000000000000000802';
    const dest = 'cd'.repeat(32);
    const amount = (10n ** 18n).toString(16).padStart(64, '0');

    it('reads the recipient and the amount of transfer and transferKeepAlive', () => {
        for (const [selector, method] of [
            ['6a467394', 'transfer'],
            ['ac6ac4c4', 'transferKeepAlive'],
        ] as const) {
            expect(decodePrecompileCalldata(BALANCES, `0x${selector}${dest}${amount}`)).toEqual({
                fnSig: expect.stringContaining('(bytes32,uint256)'),
                method,
                args: { recipient: `0x${dest}`, amount: 10n ** 18n },
            });
        }
    });

    it('leaves the args empty when the calldata is cut short', () => {
        expect(decodePrecompileCalldata(BALANCES, `0x6a467394${dest}`)?.args).toEqual({});
    });
});
