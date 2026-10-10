import { describe, expect, it, vi } from 'vitest';
import { PrivacyModule } from '../../../src/chain/rpc/PrivacyModule';
import type { SubstrateClient } from '../../../src/chain/substrate/SubstrateClient';

function makeSubstrate(responses: Record<string, unknown>): SubstrateClient {
    return {
        request: vi.fn(async (method: string, _params: unknown[]) => {
            if (method in responses) return responses[method];
            throw new Error(`Unexpected RPC method: ${method}`);
        }),
    } as unknown as SubstrateClient;
}

describe('PrivacyModule.getMerkleRoot', () => {
    it('calls the rpc-v2 merkle root endpoint', async () => {
        const substrate = makeSubstrate({ privacy_getMerkleRoot: '0xroot' });
        const root = await new PrivacyModule(substrate).getMerkleRoot();
        expect(root).toBe('0xroot');
        expect(substrate.request).toHaveBeenCalledWith('privacy_getMerkleRoot', []);
    });
});

describe('PrivacyModule.getMerkleProof', () => {
    it('maps snake_case response to camelCase shape', async () => {
        const substrate = makeSubstrate({
            privacy_getMerkleProof: {
                path: ['0xa', '0xb'],
                leaf_index: 7,
                tree_depth: 32,
            },
        });
        const proof = await new PrivacyModule(substrate).getMerkleProof(7);
        expect(proof).toEqual({
            path: ['0xa', '0xb'],
            leafIndex: 7,
            treeDepth: 32,
        });
        expect(substrate.request).toHaveBeenCalledWith('privacy_getMerkleProof', [7]);
    });

    it('mapea tree_id del nodo a treeId', async () => {
        const substrate = makeSubstrate({
            privacy_getMerkleProof: {
                path: ['0xa'],
                leaf_index: 7,
                tree_depth: 20,
                tree_id: 3,
            },
        });
        const proof = await new PrivacyModule(substrate).getMerkleProof(7);
        expect(proof.treeId).toBe(3);
    });

    it('deja treeId indefinido contra un nodo pre-forest', async () => {
        const substrate = makeSubstrate({
            privacy_getMerkleProof: {
                path: ['0xa'],
                leaf_index: 7,
                tree_depth: 20,
            },
        });
        const proof = await new PrivacyModule(substrate).getMerkleProof(7);
        expect(proof.treeId).toBeUndefined();
    });

    it('manda el índice tal cual, sin envolverlo', async () => {
        // El nodo declara este parámetro `u32`. Un commitment hex lo rechaza la
        // deserialización antes de mirar el árbol — para eso está
        // `getMerkleProofByCommitment`, que sí toma string. El test anterior
        // pasaba un hex contra un MOCK, así que fijaba lo contrario de lo que
        // la cadena acepta.
        const substrate = makeSubstrate({
            privacy_getMerkleProof: { path: ['0xc'], leaf_index: 5, tree_depth: 32 },
        });

        await new PrivacyModule(substrate).getMerkleProof(5);

        expect(substrate.request).toHaveBeenCalledWith('privacy_getMerkleProof', [5]);
    });
});

describe('PrivacyModule.getNullifierStatus', () => {
    it('maps snake_case response to camelCase shape', async () => {
        const substrate = makeSubstrate({
            privacy_getNullifierStatus: {
                nullifier: '0xdead',
                is_spent: true,
            },
        });
        const status = await new PrivacyModule(substrate).getNullifierStatus('0xdead');
        expect(status).toEqual({
            nullifier: '0xdead',
            isSpent: true,
        });
        expect(substrate.request).toHaveBeenCalledWith('privacy_getNullifierStatus', ['0xdead']);
    });
});

describe('PrivacyModule.getPoolStats', () => {
    it('preserves u128 values as decimal strings and maps balances', async () => {
        const substrate = makeSubstrate({
            privacy_getPoolStats: {
                merkle_root: '0xroot',
                commitment_count: 12,
                nullifier_count: 7,
                total_balance: '1000000000000000000',
                asset_balances: [
                    { asset_id: 0, balance: '900000000000000000' },
                    { asset_id: 1, balance: 1000 },
                ],
                tree_depth: 20,
            },
        });
        const stats = await new PrivacyModule(substrate).getPoolStats();
        expect(stats).toEqual({
            merkleRoot: '0xroot',
            commitmentCount: 12,
            nullifierCount: 7,
            totalBalance: '1000000000000000000',
            assetBalances: [
                { assetId: 0, balance: '900000000000000000' },
                { assetId: 1, balance: '1000' },
            ],
            treeDepth: 20,
        });
        expect(substrate.request).toHaveBeenCalledWith('privacy_getPoolStats', []);
    });

    it('exposes nullifierCount for active-notes estimation', async () => {
        const substrate = makeSubstrate({
            privacy_getPoolStats: {
                merkle_root: '0xroot',
                commitment_count: 20,
                nullifier_count: 8,
                total_balance: 0,
                asset_balances: [],
                tree_depth: 20,
            },
        });
        const stats = await new PrivacyModule(substrate).getPoolStats();
        expect(stats.nullifierCount).toBe(8);
        expect(stats.commitmentCount - stats.nullifierCount).toBe(12); // estimated active notes
    });

    it('still reports the counts when the node omits the balance fields', async () => {
        // `request<T>()` asserts a shape and validates nothing, so the body is
        // whatever the runtime emitted. Mapping an absent `asset_balances` threw
        // `Cannot read properties of undefined (reading 'map')` and took the
        // whole call down over statistics nothing signs against.
        const substrate = makeSubstrate({
            privacy_getPoolStats: {
                merkle_root: '0xroot',
                commitment_count: 12,
                nullifier_count: 7,
                tree_depth: 20,
            },
        });

        const stats = await new PrivacyModule(substrate).getPoolStats();

        expect(stats.commitmentCount).toBe(12);
        expect(stats.totalBalance).toBe('0');
        expect(stats.assetBalances).toEqual([]);
    });
});

describe('PrivacyModule.getMerkleProofByCommitment', () => {
    it('usa privacy_getMerkleProofByCommitment para garantizar root y path atómicos', async () => {
        const substrate = makeSubstrate({
            privacy_getMerkleProofByCommitment: {
                root: '0xcurrentroot',
                path: ['0xaa', '0xbb'],
                leaf_index: 3,
                tree_depth: 20,
            },
        });
        const proof = await new PrivacyModule(substrate).getMerkleProofByCommitment('0xdeadbeef');
        expect(proof).toEqual({
            path: ['0xaa', '0xbb'],
            leafIndex: 3,
            treeDepth: 20,
            root: '0xcurrentroot',
        });
        expect(substrate.request).toHaveBeenCalledWith('privacy_getMerkleProofByCommitment', [
            '0xdeadbeef',
        ]);
        expect(substrate.request).not.toHaveBeenCalledWith('privacy_getMerkleRoot', []);
    });

    it('incluye root en el resultado tomado del mismo endpoint atómico', async () => {
        const substrate = makeSubstrate({
            privacy_getMerkleProofByCommitment: {
                root: '0xabcdef',
                path: [],
                leaf_index: 0,
                tree_depth: 20,
            },
        });
        const proof = await new PrivacyModule(substrate).getMerkleProofByCommitment('0x01');
        expect(proof.root).toBe('0xabcdef');
    });
});

describe('PrivacyModule.getSubtreeRoots', () => {
    const root = (b: string) => '0x' + b.repeat(31) + '00';
    const raw = {
        tree_id: 1,
        level: 6,
        tree_leaves: 130,
        sealed: false,
        root: root('09'),
        start: 0,
        roots: [root('0a'), root('0b'), root('0c')],
    };

    it('maps the response and passes tree, start and count', async () => {
        const substrate = makeSubstrate({ privacy_getSubtreeRoots: raw });
        const page = await new PrivacyModule(substrate).getSubtreeRoots(1, 0, 4096);
        expect(page).toEqual({
            treeId: 1,
            level: 6,
            treeLeaves: 130,
            sealed: false,
            root: root('09'),
            start: 0,
            roots: [root('0a'), root('0b'), root('0c')],
        });
        expect(substrate.request).toHaveBeenCalledWith('privacy_getSubtreeRoots', [1, 0, 4096]);
    });

    it('refuses a response that does not answer the request', async () => {
        const substrate = makeSubstrate({ privacy_getSubtreeRoots: { ...raw, start: 7 } });
        await expect(new PrivacyModule(substrate).getSubtreeRoots(1, 0, 4096)).rejects.toThrow(
            /invalid subtree roots/
        );
    });

    it('retries a busy node', async () => {
        let calls = 0;
        const substrate = {
            request: vi.fn(async () => {
                if (++calls < 2)
                    throw Object.assign(new Error('Merkle proof queue is full'), { code: -32009 });
                return raw;
            }),
        } as unknown as SubstrateClient;
        await new PrivacyModule(substrate).getSubtreeRoots(1, 0, 4096);
        expect(calls).toBe(2);
    });
});

describe('PrivacyModule — a busy node', () => {
    it('retries the proof by commitment until the node has room', async () => {
        let calls = 0;
        const substrate = {
            request: vi.fn(async () => {
                if (++calls < 3)
                    throw Object.assign(new Error('Merkle proof queue is full'), { code: -32009 });
                return { root: '0xr', path: ['0xa'], leaf_index: 1, tree_depth: 20, tree_id: 0 };
            }),
        } as unknown as SubstrateClient;
        const proof = await new PrivacyModule(substrate).getMerkleProofByCommitment('0xc');
        expect(proof.leafIndex).toBe(1);
        expect(calls).toBe(3);
    });

    it('does not retry a missing commitment', async () => {
        const substrate = {
            request: vi.fn(async () => {
                throw new Error('commitment not found');
            }),
        } as unknown as SubstrateClient;
        await expect(
            new PrivacyModule(substrate).getMerkleProofByCommitment('0xc')
        ).rejects.toThrow('not found');
        expect(substrate.request).toHaveBeenCalledTimes(1);
    });
});
