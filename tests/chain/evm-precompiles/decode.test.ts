import { describe, it, expect } from 'vitest';
import { decodePrecompileCalldata } from '../../../src/chain/evm/precompiles/decode';
import { ShieldedPoolPrecompile } from '../../../src/chain/evm/precompiles/ShieldedPoolPrecompile';
import { PRECOMPILE_ADDR } from '../../../src/chain/evm/precompiles/addresses';
import type { EvmClient } from '../../../src/chain/evm/EvmClient';

/** A stand-in shield proof: the calls carry it, nothing here verifies it. */
const SHIELD_PROOF = new Uint8Array(128).fill(1);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SP_ADDR = PRECOMPILE_ADDR.SHIELDED_POOL;

const COMMITMENT = '0x' + 'aa'.repeat(32);
const NULLIFIER = '0x' + 'bb'.repeat(32);
// Canonical: a root is a field element, so its top (little-endian last) byte stays below r's.
const ROOT = '0x' + 'cc'.repeat(31) + '00';
const PROOF = new Uint8Array([0x01, 0x02, 0x03]);
const RECIPIENT = '0x' + 'dd'.repeat(32);

function mockEvm(): EvmClient {
    return { call: async () => '0x', estimateGas: async () => 0n } as unknown as EvmClient;
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
        const calldata = new ShieldedPoolPrecompile(mockEvm()).buildShieldCalldata({
            assetId: 0,
            amount: 1n,
            commitment: COMMITMENT,
            encryptedMemo: new Uint8Array(180),
            proof: SHIELD_PROOF,
            circuitVersion: 1,
        });
        const upper = SP_ADDR.toUpperCase();
        const result = decodePrecompileCalldata(upper, calldata);
        expect(result).not.toBeNull();
        expect(result?.fnSig).toMatch(/^shield\(/);
    });
});

// ─── shield(uint32,bytes32,bytes) — round-trip ───────────────────────────────
// amount is msg.value (NOT in calldata)

describe('decodePrecompileCalldata — shield', () => {
    const sp = new ShieldedPoolPrecompile(mockEvm());

    it('decodes fnSig correctly', () => {
        const calldata = sp.buildShieldCalldata({
            assetId: 0,
            amount: 1_000n,
            commitment: COMMITMENT,
            encryptedMemo: new Uint8Array(180),
            proof: SHIELD_PROOF,
            circuitVersion: 1,
        });
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.fnSig).toBe('shield(uint32,bytes32,bytes,bytes,uint32)');
        expect(calldata.slice(0, 10)).toBe('0xf25897e0');
    });

    it('decodes the circuit version', () => {
        const calldata = sp.buildShieldCalldata({
            assetId: 0,
            amount: 1n,
            commitment: COMMITMENT,
            encryptedMemo: new Uint8Array(180),
            proof: SHIELD_PROOF,
            circuitVersion: 4,
        });
        expect(decodePrecompileCalldata(SP_ADDR, calldata)?.args['circuitVersion']).toBe(4n);
    });

    // Every deposit before spec 17 used this calldata; history must still decode.
    it('decodes a pre-proof shield(uint32,bytes32,bytes) from history', () => {
        const word = (n: number) => n.toString(16).padStart(64, '0');
        const legacy =
            '0x9feb22ea' + word(7) + 'aa'.repeat(32) + word(96) + word(180) + '00'.repeat(192);
        const result = decodePrecompileCalldata(SP_ADDR, legacy);
        expect(result?.fnSig).toBe('shield(uint32,bytes32,bytes)');
        expect(result?.args['assetId']).toBe(7n);
        expect(result?.args['commitment']).toBe(COMMITMENT);
        expect(result?.args['circuitVersion']).toBeUndefined();
    });

    it('round-trips assetId', () => {
        const calldata = sp.buildShieldCalldata({
            assetId: 7,
            amount: 1n,
            commitment: COMMITMENT,
            encryptedMemo: new Uint8Array(180),
            proof: SHIELD_PROOF,
            circuitVersion: 1,
        });
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.args['assetId']).toBe(7n);
    });

    it('amount is NOT present in args (it is msg.value)', () => {
        const calldata = sp.buildShieldCalldata({
            assetId: 0,
            amount: 1_000_000_000_000_000_000n,
            commitment: COMMITMENT,
            encryptedMemo: new Uint8Array(180),
            proof: SHIELD_PROOF,
            circuitVersion: 1,
        });
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.args['amount']).toBeUndefined();
    });

    it('round-trips commitment as 0x-prefixed hex', () => {
        const calldata = sp.buildShieldCalldata({
            assetId: 0,
            amount: 1n,
            commitment: COMMITMENT,
            encryptedMemo: new Uint8Array(180),
            proof: SHIELD_PROOF,
            circuitVersion: 1,
        });
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(typeof result?.args['commitment']).toBe('string');
        expect((result?.args['commitment'] as string).toLowerCase()).toBe(COMMITMENT.toLowerCase());
    });
});

// ─── unshield(bytes,bytes32,bytes32,uint32,uint256,bytes32,uint256,bytes32) — round-trip ──────

describe('decodePrecompileCalldata — unshield', () => {
    const sp = new ShieldedPoolPrecompile(mockEvm());

    const params = {
        proof: PROOF,
        merkleRoot: ROOT,
        nullifier: NULLIFIER,
        assetId: 1,
        amount: 500_000n,
        recipientAddress: RECIPIENT,
        circuitVersion: 1,
    };

    it('decodes fnSig correctly', () => {
        const calldata = sp.buildUnshieldCalldata(params);
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.fnSig).toBe(
            'unshield(bytes,bytes32,bytes32,uint32,uint256,bytes32,uint256,bytes32,bytes,uint32)'
        );
    });

    it('round-trips circuitVersion', () => {
        const calldata = sp.buildUnshieldCalldata({ ...params, circuitVersion: 7 });
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.args['circuitVersion']).toBe(7n);
    });

    it('round-trips root', () => {
        const calldata = sp.buildUnshieldCalldata(params);
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect((result?.args['root'] as string).toLowerCase()).toBe(ROOT.toLowerCase());
    });

    it('round-trips nullifier', () => {
        const calldata = sp.buildUnshieldCalldata(params);
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect((result?.args['nullifier'] as string).toLowerCase()).toBe(NULLIFIER.toLowerCase());
    });

    it('round-trips assetId', () => {
        const calldata = sp.buildUnshieldCalldata(params);
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.args['assetId']).toBe(1n);
    });

    it('round-trips amount', () => {
        const calldata = sp.buildUnshieldCalldata(params);
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.args['amount']).toBe(500_000n);
    });

    it('round-trips recipient', () => {
        const calldata = sp.buildUnshieldCalldata(params);
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect((result?.args['recipient'] as string).toLowerCase()).toBe(RECIPIENT.toLowerCase());
    });

    it('decodes fee as 0n when not specified', () => {
        const calldata = sp.buildUnshieldCalldata(params);
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.args['fee']).toBe(0n);
    });

    it('round-trips fee', () => {
        const calldata = sp.buildUnshieldCalldata({ ...params, fee: 1_000_000_000_000_000n });
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.args['fee']).toBe(1_000_000_000_000_000n);
    });
});

// ─── privateTransfer(bytes,bytes32,bytes32[],bytes32[],bytes[],uint32,uint256) — round-trip ──

describe('decodePrecompileCalldata — privateTransfer', () => {
    const sp = new ShieldedPoolPrecompile(mockEvm());

    const BASE_TRANSFER = {
        proof: PROOF,
        merkleRoots: [ROOT, ROOT] as [string, string],
        inputs: [{ nullifier: NULLIFIER, commitment: COMMITMENT }],
        outputs: [{ commitment: COMMITMENT, encryptedMemo: new Uint8Array(180) }],
        assetId: 0,
        circuitVersion: 1,
    };

    it('decodes fnSig correctly', () => {
        const calldata = sp.buildPrivateTransferCalldata(BASE_TRANSFER);
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.fnSig).toBe(
            'privateTransfer(bytes,bytes32[],bytes32[],bytes32[],bytes[],uint32,uint256,uint32)'
        );
    });

    it('round-trips circuitVersion', () => {
        const calldata = sp.buildPrivateTransferCalldata({ ...BASE_TRANSFER, circuitVersion: 5 });
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.args['circuitVersion']).toBe(5n);
    });

    it('round-trips one root per input, in order', () => {
        const other = '0x' + '7e'.repeat(31) + '00';
        const calldata = sp.buildPrivateTransferCalldata({
            ...BASE_TRANSFER,
            merkleRoots: [ROOT, other],
        });
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect((result?.args['roots'] as string[]).map((r) => r.toLowerCase())).toEqual([
            ROOT.toLowerCase(),
            other,
        ]);
    });

    it('still decodes the single-root calldata of older blocks', () => {
        const head = new Uint8Array(8 * 32);
        head.set(new Uint8Array(32).fill(0x5a), 32);
        const hex = Array.from(head, (b) => b.toString(16).padStart(2, '0')).join('');
        const result = decodePrecompileCalldata(SP_ADDR, '0x66ed2cd4' + hex);
        expect(result?.method).toBe('privateTransfer');
        expect(result?.args['root']).toBe('0x' + '5a'.repeat(32));
    });

    it('reports no roots for a hostile roots offset', () => {
        const head = new Uint8Array(8 * 32);
        head.set(new Uint8Array(32).fill(0xff), 32); // offset → roots: far past the end
        const hex = Array.from(head, (b) => b.toString(16).padStart(2, '0')).join('');
        const result = decodePrecompileCalldata(SP_ADDR, '0x63d0b9a0' + hex);
        expect(result?.args['roots']).toEqual([]);
    });

    /** A privateTransfer calldata of `head` plus `tail`, with the roots offset and count given. */
    function withRoots(
        offset: bigint,
        count: bigint,
        tail: Uint8Array = new Uint8Array(0)
    ): string {
        const word = (v: bigint) => {
            const w = new Uint8Array(32);
            for (let i = 31; i >= 0; i--, v >>= 8n) w[i] = Number(v & 0xffn);
            return w;
        };
        const data = new Uint8Array(8 * 32 + 32 + tail.length);
        data.set(word(offset), 32);
        data.set(word(count), 8 * 32);
        data.set(tail, 8 * 32 + 32);
        return '0x63d0b9a0' + Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('');
    }

    it('never reads the head as roots: an offset into the head reports none', () => {
        for (const offset of [0n, 32n, 64n, 7n * 32n]) {
            expect(decodePrecompileCalldata(SP_ADDR, withRoots(offset, 2n))?.args['roots']).toEqual(
                []
            );
        }
    });

    it('reports none for a count past two, or roots that run past the data', () => {
        const two = new Uint8Array(64).fill(0x11);
        expect(decodePrecompileCalldata(SP_ADDR, withRoots(256n, 3n, two))?.args['roots']).toEqual(
            []
        );
        expect(
            decodePrecompileCalldata(SP_ADDR, withRoots(256n, 1n << 255n, two))?.args['roots']
        ).toEqual([]);
        expect(
            decodePrecompileCalldata(SP_ADDR, withRoots(256n, 2n, two.slice(0, 40)))?.args['roots']
        ).toEqual([]);
        expect(
            decodePrecompileCalldata(SP_ADDR, withRoots(1n << 200n, 2n, two))?.args['roots']
        ).toEqual([]);
    });

    it('reads exactly the roots a well-placed array holds', () => {
        const two = new Uint8Array(64);
        two.fill(0x11, 0, 32);
        two.fill(0x22, 32);
        expect(decodePrecompileCalldata(SP_ADDR, withRoots(256n, 2n, two))?.args['roots']).toEqual([
            '0x' + '11'.repeat(32),
            '0x' + '22'.repeat(32),
        ]);
        expect(decodePrecompileCalldata(SP_ADDR, withRoots(256n, 0n))?.args['roots']).toEqual([]);
    });

    it('counts nullifiers correctly', () => {
        const calldata = sp.buildPrivateTransferCalldata({
            ...BASE_TRANSFER,
            inputs: [
                { nullifier: NULLIFIER, commitment: COMMITMENT },
                { nullifier: NULLIFIER, commitment: COMMITMENT },
            ],
        });
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.args['nullifiers']).toBe(2);
    });

    it('counts commitments correctly', () => {
        const calldata = sp.buildPrivateTransferCalldata({
            ...BASE_TRANSFER,
            outputs: [
                { commitment: COMMITMENT, encryptedMemo: new Uint8Array(180) },
                { commitment: COMMITMENT, encryptedMemo: new Uint8Array(180) },
            ],
        });
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.args['commitments']).toBe(2);
    });

    it('round-trips assetId', () => {
        const calldata = sp.buildPrivateTransferCalldata({ ...BASE_TRANSFER, assetId: 3 });
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.args['assetId']).toBe(3n);
    });

    it('round-trips fee', () => {
        const calldata = sp.buildPrivateTransferCalldata({ ...BASE_TRANSFER, fee: 1_000_000n });
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.args['fee']).toBe(1_000_000n);
    });

    it('decodes fee as 0n when not specified', () => {
        const calldata = sp.buildPrivateTransferCalldata(BASE_TRANSFER);
        const result = decodePrecompileCalldata(SP_ADDR, calldata);
        expect(result?.args['fee']).toBe(0n);
    });
});

/**
 * `method` — la operación, desde el selector.
 *
 * Existe porque la derivación obvia a partir de `fnSig` es buscar substrings, y
 * `shield` ES substring de `unshield`: un clasificador que comprueba en el orden
 * equivocado reporta cada unshield como shield, sin fallar, y un método nuevo
 * del pallet lo vuelve a romper.
 */
describe('decodePrecompileCalldata — method', () => {
    const sp = new ShieldedPoolPrecompile(mockEvm());

    it('SEGURIDAD: un unshield nunca se clasifica como shield', () => {
        // El caso concreto: 'unshield(' contiene 'shield('. Anclado al inicio y
        // comprobado antes, no puede confundirse.
        const calldata = sp.buildUnshieldCalldata({
            proof: PROOF,
            merkleRoot: ROOT,
            nullifier: NULLIFIER,
            assetId: 1,
            amount: 500_000n,
            recipientAddress: RECIPIENT,
            circuitVersion: 1,
        });
        expect(decodePrecompileCalldata(SP_ADDR, calldata)?.method).toBe('unshield');
    });

    it('clasifica un shield', () => {
        const calldata = sp.buildShieldCalldata({
            assetId: 0,
            amount: 1_000n,
            commitment: COMMITMENT,
            encryptedMemo: new Uint8Array(180),
            proof: SHIELD_PROOF,
            circuitVersion: 1,
        });
        expect(decodePrecompileCalldata(SP_ADDR, calldata)?.method).toBe('shield');
    });
});

// ─── Truncated calldata is not a source of invented values ───────────────────
//
// This decoder reads calldata taken FROM THE CHAIN, so its input is whatever
// anyone chose to submit — including a call that was never valid. `decodeUint`
// reads a fixed 32-byte window and substitutes `?? 0` for bytes past the end,
// so a half-present field is completed with zeros and returns a number nobody
// encoded. Consumers render `args.amount` to the user as the transaction's
// value, which makes a fabricated amount worse than an absent one.

describe('decodePrecompileCalldata — truncated input', () => {
    /** A well-formed call, cut to `bytes` of payload after the selector. */
    function truncate(fullCalldata: string, bytes: number): string {
        return fullCalldata.slice(0, 10 + bytes * 2);
    }

    const fullUnshield = () =>
        new ShieldedPoolPrecompile(mockEvm()).buildUnshieldCalldata({
            proof: PROOF,
            merkleRoot: ROOT,
            nullifier: NULLIFIER,
            assetId: 0,
            amount: 1000n,
            recipientAddress: RECIPIENT,
            circuitVersion: 1,
        });

    it('does not report an amount when the amount field is cut in half', () => {
        // The amount slot is [128,160). Sixteen present bytes of 0xff plus
        // sixteen substituted zeros decode to ~1.15e77 — a value the sender
        // never wrote, shown to a user as what they are about to pay.
        const cut = truncate(fullUnshield(), 144);
        const decoded = decodePrecompileCalldata(SP_ADDR, cut);

        expect(decoded?.args['amount']).toBeUndefined();
    });

    it('does not report fields that lie entirely past the end', () => {
        const cut = truncate(fullUnshield(), 100);
        const decoded = decodePrecompileCalldata(SP_ADDR, cut);

        expect(decoded?.args['amount']).toBeUndefined();
        expect(decoded?.args['circuitVersion']).toBeUndefined();
    });

    it('still names the method for a truncated call', () => {
        // Losing the args must not lose the classification: the UI can still
        // label the row, it just has no amount to show.
        const decoded = decodePrecompileCalldata(SP_ADDR, truncate(fullUnshield(), 100));

        expect(decoded?.method).toBe('unshield');
    });

    it('decodes every field when the calldata is complete', () => {
        const decoded = decodePrecompileCalldata(SP_ADDR, fullUnshield());

        expect(decoded?.args['amount']).toBe(1000n);
        expect(decoded?.args['circuitVersion']).toBe(1n);
    });
});

// ─── Array offsets are read from the calldata itself ─────────────────────────

describe('decodePrecompileCalldata — hostile array offsets', () => {
    /** A privateTransfer head with `offset` written into the nullifiers slot. */
    function transferWithNullifierOffset(offset: bigint, headSlots = 8): string {
        const data = new Uint8Array(headSlots * 32);
        const slot = new Uint8Array(32);
        let v = offset;
        for (let i = 31; i >= 0; i--) {
            slot[i] = Number(v & 0xffn);
            v >>= 8n;
        }
        data.set(slot, 64); // [64,96) — offset → nullifiers
        const hex = Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('');
        return '0x66ed2cd4' + hex;
    }

    it('does not report a count for an offset past the end of the calldata', () => {
        // The offset is attacker-chosen. Following it past the end reads a
        // length out of substituted zero bytes and reports "0 nullifiers" for a
        // call whose shape is unknown.
        const decoded = decodePrecompileCalldata(SP_ADDR, transferWithNullifierOffset(2n ** 64n));

        expect(decoded?.args['nullifiers']).toBeUndefined();
    });

    it('does not report a count for an offset that lands on a partial word', () => {
        // An offset 16 bytes short of the end leaves half a length word, which
        // decodes to a huge number rather than failing.
        const decoded = decodePrecompileCalldata(
            SP_ADDR,
            transferWithNullifierOffset(BigInt(8 * 32 - 16))
        );

        expect(decoded?.args['nullifiers']).toBeUndefined();
    });

    it('still reports the fixed fields when an offset is unusable', () => {
        // The head is intact, so root/assetId/fee/circuitVersion remain valid —
        // only the array counts are dropped.
        const decoded = decodePrecompileCalldata(SP_ADDR, transferWithNullifierOffset(2n ** 64n));

        expect(decoded?.method).toBe('privateTransfer');
        expect(decoded?.args['circuitVersion']).toBeDefined();
    });
});

describe('decodePrecompileCalldata — relayer calls', () => {
    it('names and decodes claimRelayFees', async () => {
        let data = '';
        await new ShieldedPoolPrecompile(mockEvm()).claimRelayFees(
            { assetId: 0, amount: 5_000n },
            async (tx) => {
                data = tx.data;
                return '0xhash';
            }
        );
        const decoded = decodePrecompileCalldata(SP_ADDR, data);
        expect(decoded?.method).toBe('claimRelayFees');
        expect(decoded?.args['assetId']).toBe(0n);
        expect(decoded?.args['amount']).toBe(5_000n);
    });

    it('names and decodes commitRelay', () => {
        const commits = ['0x' + '11'.repeat(32), '0x' + '22'.repeat(32)];
        const word = (n: number) => n.toString(16).padStart(64, '0');
        const data = '0xc9b235ff' + word(32) + word(2) + commits.map((c) => c.slice(2)).join('');
        const decoded = decodePrecompileCalldata(SP_ADDR, data);
        expect(decoded?.method).toBe('commitRelay');
        expect(decoded?.args['count']).toBe(2);
        expect(decoded?.args['commits']).toEqual(commits);
    });

    // claimShieldedFees (0x88d9deba) was removed in runtime spec 16 and never
    // called on-chain, so it is not a known selector any more.
    it('does not recognise the removed claimShieldedFees selector', () => {
        const data = '0x88d9deba' + '00'.repeat(32 * 7);
        expect(decodePrecompileCalldata(SP_ADDR, data)).toBeNull();
    });
});
