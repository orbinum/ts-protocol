import { describe, it, expect, expectTypeOf, vi } from 'vitest';
import { ShieldedPoolModule } from '../../../../src/chain/pallet/shielded-pool/ShieldedPoolModule';
import type { SubstrateClient } from '../../../../src/chain/substrate/SubstrateClient';
import type { SubmitOptions } from '../../../../src/chain/tx';

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
    merkleRoot: '0x' + 'cd'.repeat(31) + '00',
    nullifier: '0x' + 'ef'.repeat(32),
    assetId: 0,
    amount: 500n,
    recipientAddress: '0x' + '12'.repeat(32),
    circuitVersion: 3,
};

const TRANSFER_PARAMS = {
    assetId: 0,
    inputs: [{ nullifier: '0x' + 'aa'.repeat(32) }, { nullifier: '0x' + 'cc'.repeat(32) }],
    outputs: [
        { commitment: '0x' + 'ee'.repeat(32), encryptedMemo: new Uint8Array(180) },
        { commitment: '0x' + 'ff'.repeat(32), encryptedMemo: new Uint8Array(180) },
    ],
    proof: new Uint8Array(32),
    merkleRoots: ['0x' + 'a1'.repeat(31) + '00', '0x' + 'a2'.repeat(31) + '00'] as [string, string],
    circuitVersion: 3,
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
        const mod = new ShieldedPoolModule(bareTxClient('unshield'));
        const result = await mod.unshield(UNSHIELD_PARAMS);
        expect(result.ok).toBe(true);
        expect(result.txHash).toBe('0xabc');
    });

    it('calls the unshield tx entry exactly once', async () => {
        const client = bareTxClient('unshield');
        await new ShieldedPoolModule(client).unshield(UNSHIELD_PARAMS);
        expect(client._txEntry).toHaveBeenCalledTimes(1);
    });

    it('throws when pallet is missing', async () => {
        const client = { request: vi.fn(), unsafe: { tx: {} } } as unknown as SubstrateClient;
        const mod = new ShieldedPoolModule(client);
        await expect(mod.unshield(UNSHIELD_PARAMS)).rejects.toThrow(/ShieldedPool/);
    });
});

// ─── privateTransfer ──────────────────────────────────────────────────────────

describe('ShieldedPoolModule.privateTransfer', () => {
    it('returns a TxResult on success', async () => {
        const mod = new ShieldedPoolModule(bareTxClient('private_transfer'));
        const result = await mod.privateTransfer(TRANSFER_PARAMS);
        expect(result.ok).toBe(true);
        expect(result.txHash).toBe('0xabc');
    });

    it('calls the privateTransfer tx entry exactly once', async () => {
        const client = bareTxClient('private_transfer');
        await new ShieldedPoolModule(client).privateTransfer(TRANSFER_PARAMS);
        expect(client._txEntry).toHaveBeenCalledTimes(1);
    });

    it('throws when an output encryptedMemo has wrong size', async () => {
        const mod = new ShieldedPoolModule(bareTxClient('private_transfer'));
        const params = {
            ...TRANSFER_PARAMS,
            outputs: [
                TRANSFER_PARAMS.outputs[0]!,
                { commitment: '0x' + 'ee'.repeat(32), encryptedMemo: new Uint8Array(50) },
            ],
        };
        await expect(mod.privateTransfer(params)).rejects.toThrow(
            /EncryptedMemo: invalid size.*expected 180 bytes, got 50/
        );
    });

    it('throws when call is missing', async () => {
        const client = {
            request: vi.fn(),
            unsafe: { tx: { ShieldedPool: {} } },
        } as unknown as SubstrateClient;
        const mod = new ShieldedPoolModule(client);
        await expect(mod.privateTransfer(TRANSFER_PARAMS)).rejects.toThrow(
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

// ─── spends are never signed ──────────────────────────────────────────────────

describe('ShieldedPoolModule spends – unsigned only', () => {
    it('takes no signer: the second argument is the submit options', () => {
        // A signer parameter would be a signed path the runtime refuses (BadOrigin).
        expect(ShieldedPoolModule.prototype.unshield.length).toBeLessThanOrEqual(2);
        expect(ShieldedPoolModule.prototype.privateTransfer.length).toBeLessThanOrEqual(2);
        type UnshieldArgs = Parameters<ShieldedPoolModule['unshield']>;
        type TransferArgs = Parameters<ShieldedPoolModule['privateTransfer']>;
        expectTypeOf<UnshieldArgs[1]>().toEqualTypeOf<SubmitOptions | undefined>();
        expectTypeOf<TransferArgs[1]>().toEqualTypeOf<SubmitOptions | undefined>();
    });

    it('submits unshield bare, with onBroadcast from the options', async () => {
        const client = bareTxClient('unshield');
        const onBroadcast = vi.fn();
        const result = await new ShieldedPoolModule(client).unshield(UNSHIELD_PARAMS, {
            onBroadcast,
        });
        expect(client._getBareTx).toHaveBeenCalledOnce();
        expect(client._submitUnsignedAndWatch).toHaveBeenCalledWith('0xbaretx');
        expect(onBroadcast).toHaveBeenCalledOnce();
        expect(result.blockNumber).toBe(42);
    });

    it('submits privateTransfer bare, with onBroadcast from the options', async () => {
        const client = bareTxClient('private_transfer');
        const onBroadcast = vi.fn();
        const result = await new ShieldedPoolModule(client).privateTransfer(TRANSFER_PARAMS, {
            onBroadcast,
        });
        expect(client._getBareTx).toHaveBeenCalledOnce();
        expect(client._submitUnsignedAndWatch).toHaveBeenCalledWith('0xbaretx');
        expect(onBroadcast).toHaveBeenCalledOnce();
        expect(result.blockNumber).toBe(42);
    });
});

// ─── unshield – fee ───────────────────────────────────────────────────────────

describe('ShieldedPoolModule.unshield – fee arg', () => {
    it('passes default fee 0n as named field to tx entry', async () => {
        const client = bareTxClient('unshield');
        await new ShieldedPoolModule(client).unshield(UNSHIELD_PARAMS);
        const [arg] = client._txEntry.mock.calls[0] as [Record<string, unknown>];
        expect(arg['fee']).toBe(0n);
    });

    it('passes explicit fee as named field to tx entry', async () => {
        const client = bareTxClient('unshield');
        await new ShieldedPoolModule(client).unshield({
            ...UNSHIELD_PARAMS,
            fee: 1_000_000_000_000_000n,
        });
        const [arg] = client._txEntry.mock.calls[0] as [Record<string, unknown>];
        expect(arg['fee']).toBe(1_000_000_000_000_000n);
    });
});

// ─── privateTransfer – fee & assetId ──────────────────────────────────────────

describe('ShieldedPoolModule.privateTransfer – fee & assetId args', () => {
    it('passes default fee 0n as named field to tx entry', async () => {
        const client = bareTxClient('private_transfer');
        await new ShieldedPoolModule(client).privateTransfer(TRANSFER_PARAMS);
        const [arg] = client._txEntry.mock.calls[0] as [Record<string, unknown>];
        expect(arg['fee']).toBe(0n);
    });

    it('passes explicit fee as named field to tx entry', async () => {
        const client = bareTxClient('private_transfer');
        await new ShieldedPoolModule(client).privateTransfer({ ...TRANSFER_PARAMS, fee: 999n });
        const [arg] = client._txEntry.mock.calls[0] as [Record<string, unknown>];
        expect(arg['fee']).toBe(999n);
    });

    it('passes assetId as named field to tx entry', async () => {
        const client = bareTxClient('private_transfer');
        await new ShieldedPoolModule(client).privateTransfer({ ...TRANSFER_PARAMS, assetId: 3 });
        const [arg] = client._txEntry.mock.calls[0] as [Record<string, unknown>];
        expect(arg['asset_id']).toBe(3);
    });
});

// ─── claimFees ────────────────────────────────────────────────────────────────

describe('ShieldedPoolModule.claimFees', () => {
    it('signs claim_fees with the asset and amount', async () => {
        const client = txClient('claim_fees');
        const result = await new ShieldedPoolModule(client).claimFees(
            { assetId: 3, amount: 500n },
            mockSigner
        );
        expect(client._txEntry).toHaveBeenCalledWith({ asset_id: 3, amount: 500n });
        expect(client._signAndSubmit).toHaveBeenCalledWith(mockSigner);
        expect(result.ok).toBe(true);
    });

    it('refuses bad parameters before building the tx', async () => {
        const client = txClient('claim_fees');
        const mod = new ShieldedPoolModule(client);
        await expect(mod.claimFees({ assetId: 0, amount: 0n }, mockSigner)).rejects.toThrow(
            'claimFees.amount'
        );
        await expect(mod.claimFees({ assetId: 0, amount: 1n << 128n }, mockSigner)).rejects.toThrow(
            'claimFees.amount'
        );
        await expect(mod.claimFees({ assetId: 2 ** 32, amount: 1n }, mockSigner)).rejects.toThrow(
            'claimFees.assetId'
        );
        await expect(mod.claimFees({ assetId: -1, amount: 1n }, mockSigner)).rejects.toThrow(
            'claimFees.assetId'
        );
        expect(client._txEntry).not.toHaveBeenCalled();
    });

    it('surfaces a dispatch failure as ok: false', async () => {
        const result = await new ShieldedPoolModule(
            txClient('claim_fees', FINALIZED_ERR)
        ).claimFees({ assetId: 0, amount: 1n }, mockSigner);
        expect(result.ok).toBe(false);
    });
});

// ─── pendingFees / minSpendFee ────────────────────────────────────────────────

// Alice: the SS58 form and its AccountId32.
const ALICE_SS58 = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const ALICE_HEX = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';

/** Stub with `ShieldedPool.PendingFees` storage and the `MinSpendFee` constant. */
function readsClient(pending: unknown, minSpendFee: unknown = 1_000_000_000_000_000n) {
    const getValue = vi.fn().mockResolvedValue(pending);
    const MinSpendFee = vi.fn().mockResolvedValue(minSpendFee);
    const client = {
        request: vi.fn(),
        unsafe: {
            query: { ShieldedPool: { PendingFees: { getValue } } },
            constants: { ShieldedPool: { MinSpendFee } },
        },
    } as unknown as SubstrateClient;
    return { client, getValue, MinSpendFee };
}

describe('ShieldedPoolModule.pendingFees', () => {
    it('reads PendingFees(account, assetId) as a bigint', async () => {
        const { client, getValue } = readsClient(1_234n);
        const fees = await new ShieldedPoolModule(client).pendingFees(ALICE_SS58, 0);
        expect(fees).toBe(1_234n);
        expect(getValue).toHaveBeenCalledWith(ALICE_SS58, 0);
    });

    it('accepts an AccountId32 hex, keyed by its SS58 form', async () => {
        const { client, getValue } = readsClient(0n);
        await new ShieldedPoolModule(client).pendingFees(ALICE_HEX, 7);
        expect(getValue).toHaveBeenCalledWith(ALICE_SS58, 7);
    });

    it('normalizes a number or string value to bigint', async () => {
        expect(await new ShieldedPoolModule(readsClient(5).client).pendingFees(ALICE_SS58, 0)).toBe(
            5n
        );
        expect(
            await new ShieldedPoolModule(
                readsClient('340282366920938463463374607431768211455').client
            ).pendingFees(ALICE_SS58, 0)
        ).toBe((1n << 128n) - 1n);
    });

    it('refuses a non-address or a bad asset id before reading', async () => {
        const { client, getValue } = readsClient(0n);
        const mod = new ShieldedPoolModule(client);
        await expect(mod.pendingFees('not-an-address', 0)).rejects.toThrow('pendingFees.account');
        await expect(mod.pendingFees(ALICE_SS58, 2 ** 32)).rejects.toThrow('pendingFees.assetId');
        expect(getValue).not.toHaveBeenCalled();
    });
});

describe('ShieldedPoolModule.minSpendFee', () => {
    it('reads the MinSpendFee constant as a bigint', async () => {
        const { client, MinSpendFee } = readsClient(0n, 1_000_000_000_000_000n);
        expect(await new ShieldedPoolModule(client).minSpendFee()).toBe(1_000_000_000_000_000n);
        expect(MinSpendFee).toHaveBeenCalledOnce();
    });
});
