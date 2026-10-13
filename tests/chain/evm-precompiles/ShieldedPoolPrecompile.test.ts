import { describe, it, expect, vi } from 'vitest';
import { ShieldedPoolPrecompile } from '../../../src/chain/evm/precompiles/ShieldedPoolPrecompile';
import { SP_SEL, PRECOMPILE_ADDR } from '../../../src/chain/evm/precompiles/addresses';
import { toHex } from '../../../src/foundation/encoding/hex';
import type { EvmClient } from '../../../src/chain/evm/EvmClient';
import type { EvmSigner } from '../../../src/chain/evm/precompiles/types/index';
import type { ShieldParams } from '../../../src/chain/pallet/shielded-pool/extrinsicParams';

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

const SHIELD_PARAMS: ShieldParams = {
    assetId: 1,
    amount: 1_000_000n,
    commitment: COMMITMENT,
    encryptedMemo: new Uint8Array(180),
    proof: SHIELD_PROOF,
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

// ─── Public surface ───────────────────────────────────────────────────────────

describe('ShieldedPoolPrecompile — surface', () => {
    it('exposes shield only: spends go unsigned through Substrate', () => {
        const methods = Object.getOwnPropertyNames(ShieldedPoolPrecompile.prototype)
            .filter((name) => name !== 'constructor')
            .sort();
        expect(methods).toEqual(['buildShieldCalldata', 'estimateShieldGas', 'shield']);
    });
});
