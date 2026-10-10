import { describe, it, expect, vi } from 'vitest';
import { ShieldedPoolModule } from '../../../../src/chain/pallet/shielded-pool/ShieldedPoolModule';
import type { SubstrateClient } from '../../../../src/chain/substrate/SubstrateClient';

/** A stand-in shield proof: the calls carry it, nothing here verifies it. */
const SHIELD_PROOF = new Uint8Array(128).fill(1);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FINALIZED_OK: unknown = {
    txHash: '0xabc',
    ok: true,
    block: { hash: '0xblock', number: 42 },
};

const FINALIZED_ERR: unknown = {
    txHash: '0xerr',
    ok: false,
    block: { hash: '0xblock', number: 99 },
    dispatchError: { type: 'Module' },
};

/** Stub with a single tx call in shieldedPool pallet. */
function txClient(
    call: string,
    payload: unknown = FINALIZED_OK
): SubstrateClient & {
    _txEntry: ReturnType<typeof vi.fn>;
    _signAndSubmit: ReturnType<typeof vi.fn>;
} {
    const createAndSubmit = vi.fn().mockResolvedValue(payload);
    const txEntry = vi.fn().mockReturnValue({ createAndSubmit });
    return {
        request: vi.fn(),
        unsafe: { tx: { ShieldedPool: { [call]: txEntry } } },
        _txEntry: txEntry,
        _signAndSubmit: createAndSubmit,
    } as unknown as SubstrateClient & {
        _txEntry: ReturnType<typeof vi.fn>;
        _signAndSubmit: ReturnType<typeof vi.fn>;
    };
}

const mockSigner = {} as never;

// Common test params
const SHIELD_PARAMS = {
    assetId: 0,
    amount: 1000n,
    commitment: '0x' + 'ab'.repeat(32),
    encryptedMemo: new Uint8Array(180),
    proof: SHIELD_PROOF,
    circuitVersion: 1,
};

const UNSHIELD_PARAMS = {
    proof: new Uint8Array(32),
    merkleRoot: '0x' + 'cd'.repeat(32),
    nullifier: '0x' + 'ef'.repeat(32),
    assetId: 0,
    amount: 500n,
    recipientAddress: '0x' + '12'.repeat(32),
    circuitVersion: 1,
};

const TRANSFER_PARAMS = {
    assetId: 0,
    inputs: [
        { nullifier: '0x' + 'aa'.repeat(32), commitment: '0x' + 'bb'.repeat(32) },
        { nullifier: '0x' + 'cc'.repeat(32), commitment: '0x' + 'dd'.repeat(32) },
    ],
    outputs: [
        { commitment: '0x' + 'ee'.repeat(32), encryptedMemo: new Uint8Array(180) },
        { commitment: '0x' + 'ff'.repeat(32), encryptedMemo: new Uint8Array(180) },
    ],
    proof: new Uint8Array(32),
    merkleRoots: ['0x' + 'a1'.repeat(31) + '00', '0x' + 'a2'.repeat(31) + '00'] as [string, string],
    circuitVersion: 1,
};

// ─── shield ───────────────────────────────────────────────────────────────────

describe('ShieldedPoolModule.shield', () => {
    it('returns a TxResult on success', async () => {
        const mod = new ShieldedPoolModule(txClient('shield'));
        const result = await mod.shield(SHIELD_PARAMS, mockSigner);
        expect(result.txHash).toBe('0xabc');
        expect(result.ok).toBe(true);
        expect(result.blockNumber).toBe(42);
    });

    it('maps blockHash from block.hash', async () => {
        const mod = new ShieldedPoolModule(txClient('shield'));
        const result = await mod.shield(SHIELD_PARAMS, mockSigner);
        expect(result.blockHash).toBe('0xblock');
    });

    it('calls createAndSubmit with the provided signer', async () => {
        const client = txClient('shield');
        const mod = new ShieldedPoolModule(client);
        await mod.shield(SHIELD_PARAMS, mockSigner);
        expect(client._signAndSubmit).toHaveBeenCalledWith(mockSigner);
    });

    it('calls the shield tx entry exactly once', async () => {
        const client = txClient('shield');
        const mod = new ShieldedPoolModule(client);
        await mod.shield(SHIELD_PARAMS, mockSigner);
        expect(client._txEntry).toHaveBeenCalledTimes(1);
    });

    it('passes the shield proof and its circuit version', async () => {
        const client = txClient('shield');
        const mod = new ShieldedPoolModule(client);
        await mod.shield(SHIELD_PARAMS, mockSigner);
        const [args] = client._txEntry.mock.calls[0] as [Record<string, unknown>];
        expect(args['proof']).toBe(SHIELD_PROOF);
        expect(args['circuit_version']).toBe(1);
        expect(args['amount']).toBe(SHIELD_PARAMS.amount);
    });

    it('returns error info when tx fails', async () => {
        const client = txClient('shield', FINALIZED_ERR);
        const mod = new ShieldedPoolModule(client);
        const result = await mod.shield(SHIELD_PARAMS, mockSigner);
        expect(result.ok).toBe(false);
        expect((result as { error?: string }).error).toBe('Module');
    });

    it('throws when pallet is missing from runtime metadata', async () => {
        const client = { request: vi.fn(), unsafe: { tx: {} } } as unknown as SubstrateClient;
        const mod = new ShieldedPoolModule(client);
        await expect(mod.shield(SHIELD_PARAMS, mockSigner)).rejects.toThrow(
            /Pallet "ShieldedPool" not found/
        );
    });

    it('throws when call is missing from pallet', async () => {
        const client = {
            request: vi.fn(),
            unsafe: { tx: { ShieldedPool: {} } },
        } as unknown as SubstrateClient;
        const mod = new ShieldedPoolModule(client);
        await expect(mod.shield(SHIELD_PARAMS, mockSigner)).rejects.toThrow(
            /Call "ShieldedPool.shield" not found/
        );
    });

    it('throws when encryptedMemo has wrong size', async () => {
        const client = txClient('shield');
        const mod = new ShieldedPoolModule(client);
        const params = { ...SHIELD_PARAMS, encryptedMemo: new Uint8Array(100) };
        await expect(mod.shield(params, mockSigner)).rejects.toThrow(
            /EncryptedMemo: invalid size.*expected 180 bytes, got 100/
        );
    });
});

// ─── unshield ─────────────────────────────────────────────────────────────────

describe('ShieldedPoolModule.unshield', () => {
    it('returns a TxResult on success', async () => {
        const mod = new ShieldedPoolModule(txClient('unshield'));
        const result = await mod.unshield(UNSHIELD_PARAMS, mockSigner);
        expect(result.ok).toBe(true);
        expect(result.txHash).toBe('0xabc');
    });

    it('calls the unshield tx entry exactly once', async () => {
        const client = txClient('unshield');
        const mod = new ShieldedPoolModule(client);
        await mod.unshield(UNSHIELD_PARAMS, mockSigner);
        expect(client._txEntry).toHaveBeenCalledTimes(1);
    });

    it('calls createAndSubmit with the signer', async () => {
        const client = txClient('unshield');
        const mod = new ShieldedPoolModule(client);
        await mod.unshield(UNSHIELD_PARAMS, mockSigner);
        expect(client._signAndSubmit).toHaveBeenCalledWith(mockSigner);
    });

    it('returns error info when tx fails', async () => {
        const client = txClient('unshield', FINALIZED_ERR);
        const mod = new ShieldedPoolModule(client);
        const result = await mod.unshield(UNSHIELD_PARAMS, mockSigner);
        expect(result.ok).toBe(false);
        expect((result as { error?: string }).error).toBe('Module');
    });

    it('throws when pallet is missing', async () => {
        const client = { request: vi.fn(), unsafe: { tx: {} } } as unknown as SubstrateClient;
        const mod = new ShieldedPoolModule(client);
        await expect(mod.unshield(UNSHIELD_PARAMS, mockSigner)).rejects.toThrow(/ShieldedPool/);
    });
});

// ─── privateTransfer ──────────────────────────────────────────────────────────

describe('ShieldedPoolModule.privateTransfer', () => {
    it('returns a TxResult on success', async () => {
        const mod = new ShieldedPoolModule(txClient('private_transfer'));
        const result = await mod.privateTransfer(TRANSFER_PARAMS, mockSigner);
        expect(result.ok).toBe(true);
        expect(result.txHash).toBe('0xabc');
    });

    it('calls the privateTransfer tx entry exactly once', async () => {
        const client = txClient('private_transfer');
        const mod = new ShieldedPoolModule(client);
        await mod.privateTransfer(TRANSFER_PARAMS, mockSigner);
        expect(client._txEntry).toHaveBeenCalledTimes(1);
    });

    it('calls createAndSubmit with the signer', async () => {
        const client = txClient('private_transfer');
        const mod = new ShieldedPoolModule(client);
        await mod.privateTransfer(TRANSFER_PARAMS, mockSigner);
        expect(client._signAndSubmit).toHaveBeenCalledWith(mockSigner);
    });

    it('returns error info when tx fails', async () => {
        const client = txClient('private_transfer', FINALIZED_ERR);
        const mod = new ShieldedPoolModule(client);
        const result = await mod.privateTransfer(TRANSFER_PARAMS, mockSigner);
        expect(result.ok).toBe(false);
    });

    it('throws when an output encryptedMemo has wrong size', async () => {
        const client = txClient('private_transfer');
        const mod = new ShieldedPoolModule(client);
        const params = {
            ...TRANSFER_PARAMS,
            outputs: [{ commitment: '0x' + 'ee'.repeat(32), encryptedMemo: new Uint8Array(50) }],
        };
        await expect(mod.privateTransfer(params, mockSigner)).rejects.toThrow(
            /EncryptedMemo: invalid size.*expected 180 bytes, got 50/
        );
    });

    it('throws when call is missing', async () => {
        const client = {
            request: vi.fn(),
            unsafe: { tx: { ShieldedPool: {} } },
        } as unknown as SubstrateClient;
        const mod = new ShieldedPoolModule(client);
        await expect(mod.privateTransfer(TRANSFER_PARAMS, mockSigner)).rejects.toThrow(
            /Call "ShieldedPool.private_transfer" not found/
        );
    });
});

// ─── shieldBatch ──────────────────────────────────────────────────────────────

const BATCH_ITEM_A = {
    assetId: 0,
    amount: 100n,
    commitment: '0x' + 'ab'.repeat(32),
    encryptedMemo: new Uint8Array(180),
    proof: SHIELD_PROOF,
    circuitVersion: 1,
};

const BATCH_ITEM_B = {
    assetId: 1,
    amount: 200n,
    commitment: '0x' + 'cd'.repeat(32),
    encryptedMemo: new Uint8Array(180),
    proof: SHIELD_PROOF,
    circuitVersion: 1,
};

describe('ShieldedPoolModule.shieldBatch', () => {
    it('returns a TxResult on success', async () => {
        const mod = new ShieldedPoolModule(txClient('shield_batch'));
        const result = await mod.shieldBatch({ items: [BATCH_ITEM_A] }, mockSigner);
        expect(result.ok).toBe(true);
        expect(result.txHash).toBe('0xabc');
        expect(result.blockNumber).toBe(42);
    });

    it('calls the shieldBatch tx entry exactly once', async () => {
        const client = txClient('shield_batch');
        const mod = new ShieldedPoolModule(client);
        await mod.shieldBatch({ items: [BATCH_ITEM_A, BATCH_ITEM_B] }, mockSigner);
        expect(client._txEntry).toHaveBeenCalledTimes(1);
    });

    it('calls createAndSubmit with the signer', async () => {
        const client = txClient('shield_batch');
        const mod = new ShieldedPoolModule(client);
        await mod.shieldBatch({ items: [BATCH_ITEM_A] }, mockSigner);
        expect(client._signAndSubmit).toHaveBeenCalledWith(mockSigner);
    });

    it('passes the operations under the call argument name', async () => {
        const client = txClient('shield_batch');
        const mod = new ShieldedPoolModule(client);
        await mod.shieldBatch({ items: [BATCH_ITEM_A, BATCH_ITEM_B] }, mockSigner);
        const [args] = client._txEntry.mock.calls[0] as [{ operations: unknown[] }];
        expect(args.operations).toHaveLength(2);
    });

    it('passes each operation as a tuple in the call argument order', async () => {
        const client = txClient('shield_batch');
        const mod = new ShieldedPoolModule(client);
        await mod.shieldBatch({ items: [BATCH_ITEM_A] }, mockSigner);
        const [args] = client._txEntry.mock.calls[0] as [{ operations: unknown[][] }];
        expect(args.operations[0]).toEqual([
            0,
            100n,
            BATCH_ITEM_A.commitment,
            BATCH_ITEM_A.encryptedMemo,
            SHIELD_PROOF,
            1,
        ]);
    });

    it('refuses an item without a proof, naming it, before building the call', async () => {
        const client = txClient('shield_batch');
        const mod = new ShieldedPoolModule(client);
        const items = [BATCH_ITEM_A, { ...BATCH_ITEM_B, proof: new Uint8Array() }];
        await expect(mod.shieldBatch({ items }, mockSigner)).rejects.toThrow(
            'shieldBatch.items[1].proof'
        );
        expect(client._txEntry).not.toHaveBeenCalled();
    });

    it('returns error info when tx fails', async () => {
        const client = txClient('shield_batch', FINALIZED_ERR);
        const mod = new ShieldedPoolModule(client);
        const result = await mod.shieldBatch({ items: [BATCH_ITEM_A] }, mockSigner);
        expect(result.ok).toBe(false);
    });

    it('throws when an item encryptedMemo has wrong size', async () => {
        const client = txClient('shield_batch');
        const mod = new ShieldedPoolModule(client);
        const item = { ...BATCH_ITEM_A, encryptedMemo: new Uint8Array(32) };
        await expect(mod.shieldBatch({ items: [item] }, mockSigner)).rejects.toThrow(
            /EncryptedMemo: invalid size.*expected 180 bytes, got 32/
        );
    });

    it('returns error info when tx fails', async () => {
        const client = txClient('shield_batch', FINALIZED_ERR);
        const mod = new ShieldedPoolModule(client);
        const result = await mod.shieldBatch({ items: [BATCH_ITEM_A] }, mockSigner);
        expect(result.ok).toBe(false);
        expect((result as { error?: string }).error).toBe('Module');
    });

    it('throws when pallet is missing', async () => {
        const client = { request: vi.fn(), unsafe: { tx: {} } } as unknown as SubstrateClient;
        const mod = new ShieldedPoolModule(client);
        await expect(mod.shieldBatch({ items: [BATCH_ITEM_A] }, mockSigner)).rejects.toThrow(
            /Pallet "ShieldedPool" not found/
        );
    });

    it('throws when call is missing', async () => {
        const client = {
            request: vi.fn(),
            unsafe: { tx: { ShieldedPool: {} } },
        } as unknown as SubstrateClient;
        const mod = new ShieldedPoolModule(client);
        await expect(mod.shieldBatch({ items: [BATCH_ITEM_A] }, mockSigner)).rejects.toThrow(
            /Call "ShieldedPool.shield_batch" not found/
        );
    });
});

// ─── bareTx helpers ───────────────────────────────────────────────────────────

/** Stub that returns a tx with getBareTx (unsigned path). */
function bareTxClient(call: string): SubstrateClient & {
    _txEntry: ReturnType<typeof vi.fn>;
    _getBareTx: ReturnType<typeof vi.fn>;
    _submitUnsignedAndWatch: ReturnType<typeof vi.fn>;
} {
    const submitUnsignedAndWatch = vi.fn().mockResolvedValue(FINALIZED_OK);
    const getBareTx = vi.fn().mockResolvedValue('0xbaretx');
    const txEntry = vi.fn().mockReturnValue({ getBareTx });
    return {
        request: vi.fn(),
        unsafe: { tx: { ShieldedPool: { [call]: txEntry } } },
        submitUnsignedAndWatch,
        _txEntry: txEntry,
        _getBareTx: getBareTx,
        _submitUnsignedAndWatch: submitUnsignedAndWatch,
    } as unknown as SubstrateClient & {
        _txEntry: ReturnType<typeof vi.fn>;
        _getBareTx: ReturnType<typeof vi.fn>;
        _submitUnsignedAndWatch: ReturnType<typeof vi.fn>;
    };
}

// ─── unshield – fee & bare tx ─────────────────────────────────────────────────

describe('ShieldedPoolModule.unshield – fee arg', () => {
    it('passes default fee 0n as named field to tx entry', async () => {
        const client = txClient('unshield');
        const mod = new ShieldedPoolModule(client);
        await mod.unshield(UNSHIELD_PARAMS, mockSigner);
        const [arg] = client._txEntry.mock.calls[0] as [Record<string, unknown>];
        expect(arg['fee']).toBe(0n);
    });

    it('passes explicit fee as named field to tx entry', async () => {
        const client = txClient('unshield');
        const mod = new ShieldedPoolModule(client);
        await mod.unshield({ ...UNSHIELD_PARAMS, fee: 1_000_000_000_000_000n }, mockSigner);
        const [arg] = client._txEntry.mock.calls[0] as [Record<string, unknown>];
        expect(arg['fee']).toBe(1_000_000_000_000_000n);
    });

    it('submits as bare (unsigned) tx when no signer is provided', async () => {
        const client = bareTxClient('unshield');
        const mod = new ShieldedPoolModule(client);
        const result = await mod.unshield(UNSHIELD_PARAMS);
        expect(client._getBareTx).toHaveBeenCalledOnce();
        expect(client._submitUnsignedAndWatch).toHaveBeenCalledWith('0xbaretx');
        expect(result.ok).toBe(true);
    });

    it('returns TxResult from bare tx submission', async () => {
        const client = bareTxClient('unshield');
        const mod = new ShieldedPoolModule(client);
        const result = await mod.unshield(UNSHIELD_PARAMS);
        expect(result.txHash).toBe('0xabc');
        expect(result.blockNumber).toBe(42);
    });
});

// ─── privateTransfer – fee, assetId & bare tx ─────────────────────────────────

describe('ShieldedPoolModule.privateTransfer – fee & assetId args', () => {
    it('passes default fee 0n as named field to tx entry', async () => {
        const client = txClient('private_transfer');
        const mod = new ShieldedPoolModule(client);
        await mod.privateTransfer(TRANSFER_PARAMS, mockSigner);
        const [arg] = client._txEntry.mock.calls[0] as [Record<string, unknown>];
        expect(arg['fee']).toBe(0n);
    });

    it('passes explicit fee as named field to tx entry', async () => {
        const client = txClient('private_transfer');
        const mod = new ShieldedPoolModule(client);
        await mod.privateTransfer({ ...TRANSFER_PARAMS, fee: 999n }, mockSigner);
        const [arg] = client._txEntry.mock.calls[0] as [Record<string, unknown>];
        expect(arg['fee']).toBe(999n);
    });

    it('passes assetId as named field to tx entry', async () => {
        const client = txClient('private_transfer');
        const mod = new ShieldedPoolModule(client);
        await mod.privateTransfer({ ...TRANSFER_PARAMS, assetId: 3 }, mockSigner);
        const [arg] = client._txEntry.mock.calls[0] as [Record<string, unknown>];
        expect(arg['asset_id']).toBe(3);
    });

    it('submits as bare (unsigned) tx when no signer is provided', async () => {
        const client = bareTxClient('private_transfer');
        const mod = new ShieldedPoolModule(client);
        const result = await mod.privateTransfer(TRANSFER_PARAMS);
        expect(client._getBareTx).toHaveBeenCalledOnce();
        expect(client._submitUnsignedAndWatch).toHaveBeenCalledWith('0xbaretx');
        expect(result.ok).toBe(true);
    });

    it('returns TxResult from bare tx submission', async () => {
        const client = bareTxClient('private_transfer');
        const mod = new ShieldedPoolModule(client);
        const result = await mod.privateTransfer(TRANSFER_PARAMS);
        expect(result.txHash).toBe('0xabc');
        expect(result.blockNumber).toBe(42);
    });
});

// ─── claimRelayFees ───────────────────────────────────────────────────────────

describe('ShieldedPoolModule.claimRelayFees', () => {
    it('signs claim_relay_fees with the asset and amount', async () => {
        const client = txClient('claim_relay_fees');
        const result = await new ShieldedPoolModule(client).claimRelayFees(
            { assetId: 3, amount: 500n },
            mockSigner
        );
        expect(client._txEntry).toHaveBeenCalledWith({ asset_id: 3, amount: 500n });
        expect(client._signAndSubmit).toHaveBeenCalledWith(mockSigner);
        expect(result.ok).toBe(true);
    });

    it('refuses bad parameters before building the tx', async () => {
        const client = txClient('claim_relay_fees');
        const mod = new ShieldedPoolModule(client);
        await expect(mod.claimRelayFees({ assetId: 0, amount: 0n }, mockSigner)).rejects.toThrow(
            'claimRelayFees.amount'
        );
        await expect(
            mod.claimRelayFees({ assetId: 2 ** 32, amount: 1n }, mockSigner)
        ).rejects.toThrow('claimRelayFees.assetId');
        expect(client._txEntry).not.toHaveBeenCalled();
    });

    it('surfaces a dispatch failure as ok: false', async () => {
        const result = await new ShieldedPoolModule(
            txClient('claim_relay_fees', FINALIZED_ERR)
        ).claimRelayFees({ assetId: 0, amount: 1n }, mockSigner);
        expect(result.ok).toBe(false);
    });
});
