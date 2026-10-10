import { describe, it, expect, vi } from 'vitest';
import { ShieldedPoolPrecompile } from '../../../src/chain/evm/precompiles/ShieldedPoolPrecompile';
import { SP_SEL, PRECOMPILE_ADDR } from '../../../src/chain/evm/precompiles/addresses';
import { toHex } from '../../../src/foundation/encoding/hex';
import { fromHex } from '../../../src/foundation/encoding/hex';
import type { EvmClient } from '../../../src/chain/evm/EvmClient';
import type { EvmSigner } from '../../../src/chain/evm/precompiles/types/index';
import type {
    ShieldParams,
    UnshieldParams,
    PrivateTransferParams,
    ClaimRelayFeesParams,
} from '../../../src/chain/pallet/shielded-pool/extrinsicParams';

/** A stand-in shield proof: the calls carry it, nothing here verifies it. */
const SHIELD_PROOF = new Uint8Array(128).fill(1);

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function mockEvm(): EvmClient {
    return {
        call: vi.fn(),
        estimateGas: vi.fn().mockResolvedValue(100_000n),
    } as unknown as EvmClient;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COMMITMENT = '0x' + 'aa'.repeat(32);
const NULLIFIER = '0x' + 'bb'.repeat(32);
// Canonical: a root is a field element, so its top (little-endian last) byte stays below r's.
const ROOT = '0x' + 'cc'.repeat(31) + '00';
const PROOF = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
const RECIPIENT = '0x' + 'dd'.repeat(32); // 64 hex chars → 32 bytes

const SHIELD_PARAMS: ShieldParams = {
    assetId: 1,
    amount: 1_000_000n,
    commitment: COMMITMENT,
    encryptedMemo: new Uint8Array(180),
    proof: SHIELD_PROOF,
    circuitVersion: 1,
};

const UNSHIELD_PARAMS: UnshieldParams = {
    proof: PROOF,
    merkleRoot: ROOT,
    nullifier: NULLIFIER,
    assetId: 1,
    amount: 500_000n,
    recipientAddress: RECIPIENT,
    circuitVersion: 1,
};

const TRANSFER_PARAMS: PrivateTransferParams = {
    proof: PROOF,
    merkleRoots: [ROOT, ROOT],
    inputs: [{ nullifier: NULLIFIER, commitment: COMMITMENT }],
    outputs: [{ commitment: COMMITMENT, encryptedMemo: new Uint8Array(180) }],
    assetId: 0,
    circuitVersion: 1,
};

// ─── buildShieldCalldata ──────────────────────────────────────────────────────

describe('ShieldedPoolPrecompile.buildShieldCalldata', () => {
    it('starts with SHIELD selector', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const calldata = precompile.buildShieldCalldata(SHIELD_PARAMS);
        expect(calldata.startsWith(toHex(SP_SEL.SHIELD))).toBe(true);
    });

    it('returns 0x-prefixed hex string', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        expect(precompile.buildShieldCalldata(SHIELD_PARAMS).startsWith('0x')).toBe(true);
    });

    it('is deterministic — same params produce same calldata', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const a = precompile.buildShieldCalldata(SHIELD_PARAMS);
        const b = precompile.buildShieldCalldata(SHIELD_PARAMS);
        expect(a).toBe(b);
    });

    it('throws when encryptedMemo has wrong size', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        expect(() =>
            precompile.buildShieldCalldata({ ...SHIELD_PARAMS, encryptedMemo: new Uint8Array(104) })
        ).toThrow(/EncryptedMemo: invalid size.*expected 180 bytes, got 104/);
    });
});

// ─── buildPrivateTransferCalldata ─────────────────────────────────────────────

describe('ShieldedPoolPrecompile.buildPrivateTransferCalldata', () => {
    it('starts with PRIVATE_TRANSFER selector', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const calldata = precompile.buildPrivateTransferCalldata(TRANSFER_PARAMS);
        expect(calldata.startsWith(toHex(SP_SEL.PRIVATE_TRANSFER))).toBe(true);
    });

    it('is deterministic', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const a = precompile.buildPrivateTransferCalldata(TRANSFER_PARAMS);
        const b = precompile.buildPrivateTransferCalldata(TRANSFER_PARAMS);
        expect(a).toBe(b);
    });

    it('is longer with 2 inputs+outputs than with 1', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const one = precompile.buildPrivateTransferCalldata(TRANSFER_PARAMS);
        const two = precompile.buildPrivateTransferCalldata({
            ...TRANSFER_PARAMS,
            inputs: [
                { nullifier: NULLIFIER, commitment: COMMITMENT },
                { nullifier: NULLIFIER, commitment: COMMITMENT },
            ],
            outputs: [
                { commitment: COMMITMENT, encryptedMemo: new Uint8Array(180) },
                { commitment: COMMITMENT, encryptedMemo: new Uint8Array(180) },
            ],
        });
        expect(two.length).toBeGreaterThan(one.length);
    });

    it('encodes default fee 0n when not specified', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const without = precompile.buildPrivateTransferCalldata(TRANSFER_PARAMS);
        const withZero = precompile.buildPrivateTransferCalldata({ ...TRANSFER_PARAMS, fee: 0n });
        expect(without).toBe(withZero);
    });

    it('golden: the selector is the one the precompile decodes', () => {
        // The argument count IS the selector: keccak covers the whole signature,
        // so a ninth argument yields a different four bytes and the node answers
        // "unsupported selector". That failure is silent — indistinguishable
        // from a legitimate rejection — which is exactly how a stale selector
        // went unnoticed before. Pin it.
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const calldata = precompile.buildPrivateTransferCalldata(TRANSFER_PARAMS);
        expect(calldata.slice(0, 10)).toBe('0x63d0b9a0');
    });

    it('golden: the head is 8 slots, with the fee in slot 6', () => {
        // Eight arguments, no trailing blob. Slot 6 is where the relay reads the
        // fee (calldata[196..228] including the selector), so its position is
        // part of the contract with the node, not an implementation detail.
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const calldata = precompile.buildPrivateTransferCalldata({
            ...TRANSFER_PARAMS,
            fee: 1_234n,
        });
        const params = calldata.slice(10);
        const feeWord = params.slice(192 * 2, 224 * 2);
        expect(BigInt('0x' + feeWord)).toBe(1_234n);

        // Slot 7 (the last head slot) is the circuit version; nothing follows it
        // in the head. A ninth argument would push the tail and break this.
        const circuitWord = params.slice(224 * 2, 256 * 2);
        expect(parseInt(circuitWord, 16)).toBe(TRANSFER_PARAMS.circuitVersion);
    });

    it('produces different calldata for different fee values', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const noFee = precompile.buildPrivateTransferCalldata(TRANSFER_PARAMS);
        const hasFee = precompile.buildPrivateTransferCalldata({
            ...TRANSFER_PARAMS,
            fee: 1_000_000n,
        });
        expect(noFee).not.toBe(hasFee);
    });

    it('produces different calldata for different assetId values', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const asset0 = precompile.buildPrivateTransferCalldata(TRANSFER_PARAMS);
        const asset1 = precompile.buildPrivateTransferCalldata({ ...TRANSFER_PARAMS, assetId: 1 });
        expect(asset0).not.toBe(asset1);
    });

    it('throws when an output encryptedMemo has wrong size', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const params = {
            ...TRANSFER_PARAMS,
            outputs: [{ commitment: COMMITMENT, encryptedMemo: new Uint8Array(10) }],
        };
        expect(() => precompile.buildPrivateTransferCalldata(params)).toThrow(
            /EncryptedMemo: invalid size.*expected 180 bytes, got 10/
        );
    });
});

// ─── buildUnshieldCalldata ────────────────────────────────────────────────────

describe('ShieldedPoolPrecompile.buildUnshieldCalldata', () => {
    it('starts with UNSHIELD selector', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const calldata = precompile.buildUnshieldCalldata(UNSHIELD_PARAMS);
        expect(calldata.startsWith(toHex(SP_SEL.UNSHIELD))).toBe(true);
    });

    it('is deterministic', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const a = precompile.buildUnshieldCalldata(UNSHIELD_PARAMS);
        const b = precompile.buildUnshieldCalldata(UNSHIELD_PARAMS);
        expect(a).toBe(b);
    });

    it('pads recipient to 64 hex chars when shorter', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        // 20-byte EVM address (40 hex chars) — should be padded
        const evmRecipient = '0x' + 'ab'.repeat(20);
        const withEvmRecipient = precompile.buildUnshieldCalldata({
            ...UNSHIELD_PARAMS,
            recipientAddress: evmRecipient,
        });
        const withFullRecipient = precompile.buildUnshieldCalldata(UNSHIELD_PARAMS);
        // Both should be valid hex (same length calldata)
        expect(withEvmRecipient.length).toBe(withFullRecipient.length);
    });

    it('encodes default fee 0n when not specified', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const without = precompile.buildUnshieldCalldata(UNSHIELD_PARAMS);
        const withZero = precompile.buildUnshieldCalldata({ ...UNSHIELD_PARAMS, fee: 0n });
        expect(without).toBe(withZero);
    });

    it('produces different calldata for different fee values', () => {
        const precompile = new ShieldedPoolPrecompile(mockEvm());
        const noFee = precompile.buildUnshieldCalldata(UNSHIELD_PARAMS);
        const hasFee = precompile.buildUnshieldCalldata({
            ...UNSHIELD_PARAMS,
            fee: 1_000_000_000_000_000n,
        });
        expect(noFee).not.toBe(hasFee);
    });
});

// ─── shield (signer call) ─────────────────────────────────────────────────────

describe('ShieldedPoolPrecompile.shield', () => {
    it('calls signer with SHIELDED_POOL address', async () => {
        const signer: EvmSigner = vi.fn().mockResolvedValue('0xtxhash');
        await new ShieldedPoolPrecompile(mockEvm()).shield(SHIELD_PARAMS, signer);
        expect(vi.mocked(signer).mock.calls[0]?.[0]?.to).toBe(PRECOMPILE_ADDR.SHIELDED_POOL);
    });

    it('calldata starts with SHIELD selector', async () => {
        const signer: EvmSigner = vi.fn().mockResolvedValue('0xtxhash');
        await new ShieldedPoolPrecompile(mockEvm()).shield(SHIELD_PARAMS, signer);
        const data = vi.mocked(signer).mock.calls[0]?.[0]?.data as string;
        expect(data.startsWith(toHex(SP_SEL.SHIELD))).toBe(true);
    });

    it('returns the tx hash from signer', async () => {
        const signer: EvmSigner = vi.fn().mockResolvedValue('0xdeadbeef');
        expect(await new ShieldedPoolPrecompile(mockEvm()).shield(SHIELD_PARAMS, signer)).toBe(
            '0xdeadbeef'
        );
    });
});

// ─── privateTransfer (signer call) ───────────────────────────────────────────

describe('ShieldedPoolPrecompile.privateTransfer', () => {
    it('calls signer with SHIELDED_POOL address', async () => {
        const signer: EvmSigner = vi.fn().mockResolvedValue('0xtx');
        await new ShieldedPoolPrecompile(mockEvm()).privateTransfer(TRANSFER_PARAMS, signer);
        expect(vi.mocked(signer).mock.calls[0]?.[0]?.to).toBe(PRECOMPILE_ADDR.SHIELDED_POOL);
    });

    it('calldata starts with PRIVATE_TRANSFER selector', async () => {
        const signer: EvmSigner = vi.fn().mockResolvedValue('0xtx');
        await new ShieldedPoolPrecompile(mockEvm()).privateTransfer(TRANSFER_PARAMS, signer);
        const data = vi.mocked(signer).mock.calls[0]?.[0]?.data as string;
        expect(data.startsWith(toHex(SP_SEL.PRIVATE_TRANSFER))).toBe(true);
    });
});

// ─── unshield (signer call) ───────────────────────────────────────────────────

describe('ShieldedPoolPrecompile.unshield', () => {
    it('calls signer with SHIELDED_POOL address', async () => {
        const signer: EvmSigner = vi.fn().mockResolvedValue('0xtx');
        await new ShieldedPoolPrecompile(mockEvm()).unshield(UNSHIELD_PARAMS, signer);
        expect(vi.mocked(signer).mock.calls[0]?.[0]?.to).toBe(PRECOMPILE_ADDR.SHIELDED_POOL);
    });

    it('calldata starts with UNSHIELD selector', async () => {
        const signer: EvmSigner = vi.fn().mockResolvedValue('0xtx');
        await new ShieldedPoolPrecompile(mockEvm()).unshield(UNSHIELD_PARAMS, signer);
        const data = vi.mocked(signer).mock.calls[0]?.[0]?.data as string;
        expect(data.startsWith(toHex(SP_SEL.UNSHIELD))).toBe(true);
    });
});

// ─── Gas estimation ───────────────────────────────────────────────────────────

describe('ShieldedPoolPrecompile.estimateShieldGas', () => {
    it('calls evm.estimateGas and returns bigint', async () => {
        const evm = mockEvm();
        const result = await new ShieldedPoolPrecompile(evm).estimateShieldGas(
            SHIELD_PARAMS,
            '0xfrom'
        );
        expect(typeof result).toBe('bigint');
        expect(vi.mocked(evm.estimateGas)).toHaveBeenCalledOnce();
    });

    it('passes from and to=SHIELDED_POOL to estimateGas', async () => {
        const evm = mockEvm();
        await new ShieldedPoolPrecompile(evm).estimateShieldGas(SHIELD_PARAMS, '0xfrom');
        const args = vi.mocked(evm.estimateGas).mock.calls[0]?.[0];
        expect(args?.from).toBe('0xfrom');
        expect(args?.to).toBe(PRECOMPILE_ADDR.SHIELDED_POOL);
    });

    it('manda el VALUE, o la estimación revierte siempre', async () => {
        // `shield` es payable: el precompile toma el importe de `msg.value` y
        // rechaza el cero antes de mirar la calldata. Estimar sin él pide al
        // nodo una llamada que no puede tener éxito, así que la estimación
        // falla incluso cuando la transferencia real funcionaría.
        const evm = mockEvm();

        await new ShieldedPoolPrecompile(evm).estimateShieldGas(SHIELD_PARAMS, '0xfrom');

        const args = vi.mocked(evm.estimateGas).mock.calls[0]?.[0];
        expect(BigInt(args?.value ?? '0x0')).toBe(SHIELD_PARAMS.amount);
    });

    it('y el value coincide con el que manda `shield`', async () => {
        // Las dos rutas tienen que medir la MISMA llamada; si divergen, la
        // estimación deja de describir la transferencia que se va a enviar.
        const evm = mockEvm();
        const sp = new ShieldedPoolPrecompile(evm);
        let sentValue: bigint | undefined;

        await sp.shield(SHIELD_PARAMS, async (tx) => {
            sentValue = tx.value;
            return '0xhash';
        });
        await sp.estimateShieldGas(SHIELD_PARAMS, '0xfrom');

        const args = vi.mocked(evm.estimateGas).mock.calls[0]?.[0];
        expect(BigInt(args?.value ?? '0x0')).toBe(sentValue);
    });
});

describe('ShieldedPoolPrecompile.estimatePrivateTransferGas', () => {
    it('calls evm.estimateGas with SHIELDED_POOL address', async () => {
        const evm = mockEvm();
        await new ShieldedPoolPrecompile(evm).estimatePrivateTransferGas(TRANSFER_PARAMS, '0xfrom');
        const args = vi.mocked(evm.estimateGas).mock.calls[0]?.[0];
        expect(args?.to).toBe(PRECOMPILE_ADDR.SHIELDED_POOL);
    });
});

describe('ShieldedPoolPrecompile.estimateUnshieldGas', () => {
    it('calls evm.estimateGas with SHIELDED_POOL address', async () => {
        const evm = mockEvm();
        await new ShieldedPoolPrecompile(evm).estimateUnshieldGas(UNSHIELD_PARAMS, '0xfrom');
        const args = vi.mocked(evm.estimateGas).mock.calls[0]?.[0];
        expect(args?.to).toBe(PRECOMPILE_ADDR.SHIELDED_POOL);
    });
});

// ─── claimRelayFees ───────────────────────────────────────────────────────────

const CLAIM_PARAMS: ClaimRelayFeesParams = { assetId: 3, amount: 500_000n };

describe('ShieldedPoolPrecompile.buildClaimRelayFeesCalldata', () => {
    it('is the selector, then asset_id and amount as two words', () => {
        const calldata = new ShieldedPoolPrecompile(mockEvm()).buildClaimRelayFeesCalldata(
            CLAIM_PARAMS
        );
        const bytes = fromHex(calldata);
        expect(calldata.startsWith(toHex(SP_SEL.CLAIM_RELAY_FEES))).toBe(true);
        expect(toHex(SP_SEL.CLAIM_RELAY_FEES)).toBe('0x2a3274dd');
        expect(bytes.length).toBe(4 + 64);
        expect(bytes[4 + 31]).toBe(3);
        expect(BigInt(toHex(bytes.slice(36, 68)))).toBe(500_000n);
    });

    it('refuses a zero, negative or over-u128 amount', () => {
        const sp = new ShieldedPoolPrecompile(mockEvm());
        for (const amount of [0n, -1n, 1n << 128n]) {
            expect(() => sp.buildClaimRelayFeesCalldata({ ...CLAIM_PARAMS, amount })).toThrow(
                /amount/
            );
        }
    });

    it('refuses an asset id past u32', () => {
        expect(() =>
            new ShieldedPoolPrecompile(mockEvm()).buildClaimRelayFeesCalldata({
                ...CLAIM_PARAMS,
                assetId: 2 ** 32,
            })
        ).toThrow();
    });
});

describe('ShieldedPoolPrecompile.claimRelayFees', () => {
    it('signs a non-payable call to the shielded pool with the claim calldata', async () => {
        const signer: EvmSigner = vi.fn().mockResolvedValue('0xtxhash');
        const hash = await new ShieldedPoolPrecompile(mockEvm()).claimRelayFees(
            CLAIM_PARAMS,
            signer
        );
        const tx = vi.mocked(signer).mock.calls[0]?.[0];
        expect(hash).toBe('0xtxhash');
        expect(tx?.to).toBe(PRECOMPILE_ADDR.SHIELDED_POOL);
        expect(tx?.value).toBeUndefined();
        expect((tx?.data as string).startsWith('0x2a3274dd')).toBe(true);
    });
});

describe('ShieldedPoolPrecompile.estimateClaimRelayFeesGas', () => {
    it('estimates from the real sender against the shielded pool', async () => {
        const evm = mockEvm();
        await new ShieldedPoolPrecompile(evm).estimateClaimRelayFeesGas(CLAIM_PARAMS, '0xfrom');
        const args = vi.mocked(evm.estimateGas).mock.calls[0]?.[0];
        expect(args?.from).toBe('0xfrom');
        expect(args?.to).toBe(PRECOMPILE_ADDR.SHIELDED_POOL);
    });
});
