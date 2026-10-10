import type { SubstrateClient } from '../substrate/SubstrateClient';
import type {
    RawRpcV2MerkleProof,
    RawRpcV2NullifierStatus,
    RawRpcV2PoolStats,
    RawRpcV2SubtreeRoots,
} from './types/raw';
import type {
    RpcV2NullifierStatus,
    RpcV2PoolStats,
    RpcV2MerkleProof,
    RpcV2SubtreeRoots,
    PrivacyMerkleProof,
} from './types';
import { mapAssetBalance } from './helpers';
import { withBusyRetry } from './busy';
import { parseSubtreeRoots } from './subtreeRoots';

/**
 * Typed client for the Orbinum `rpc-v2` endpoints under the `privacy_*` namespace.
 */
export class PrivacyModule {
    constructor(private readonly substrate: SubstrateClient) {}

    /** Returns the current Merkle tree root. */
    async getMerkleRoot(): Promise<string> {
        return this.substrate.request<string>('privacy_getMerkleRoot', []);
    }

    /**
     * Returns the Merkle proof for a LEAF INDEX.
     *
     * The node declares this parameter `u32`, so a commitment hex is rejected
     * by deserialisation before any lookup runs — `getMerkleProofByCommitment`
     * is the one that takes a string.
     */
    async getMerkleProof(leafIndex: number): Promise<RpcV2MerkleProof> {
        const raw = await withBusyRetry(() =>
            this.substrate.request<RawRpcV2MerkleProof>('privacy_getMerkleProof', [leafIndex])
        );
        return {
            path: raw.path,
            leafIndex: raw.leaf_index,
            treeDepth: raw.tree_depth,
            treeId: raw.tree_id,
        };
    }

    /**
     * Returns the Merkle inclusion proof for a given commitment hex,
     * bundled with the Merkle root.
     *
     * Uses `privacy_getMerkleProofByCommitment` which resolves root and proof
     * under the **same block hash**, guaranteeing that the returned path is
     * consistent with the returned root.
     */
    async getMerkleProofByCommitment(commitmentHex: string): Promise<PrivacyMerkleProof> {
        const raw = await withBusyRetry(() =>
            this.substrate.request<RawRpcV2MerkleProof>('privacy_getMerkleProofByCommitment', [
                commitmentHex,
            ])
        );
        return {
            path: raw.path,
            leafIndex: raw.leaf_index,
            treeDepth: raw.tree_depth,
            treeId: raw.tree_id,
            root: raw.root,
        };
    }

    /**
     * Up to `count` (at most 4096 per call) level-6 subtree roots of tree
     * `treeId` from `start`, with the tree's anchoring root, read at one block.
     *
     * Asking for a tree's roots reveals nothing about which note a wallet holds
     * (see `protocol/merkle`). The response is checked against the request
     * before it is returned (`parseSubtreeRoots`); a busy node is retried.
     */
    async getSubtreeRoots(
        treeId: number,
        start: number,
        count: number
    ): Promise<RpcV2SubtreeRoots> {
        const raw = await withBusyRetry(() =>
            this.substrate.request<RawRpcV2SubtreeRoots>('privacy_getSubtreeRoots', [
                treeId,
                start,
                count,
            ])
        );
        return parseSubtreeRoots(raw, treeId, start, count);
    }

    /** Returns the spend status of a nullifier. */
    async getNullifierStatus(nullifier: string): Promise<RpcV2NullifierStatus> {
        const raw = await this.substrate.request<RawRpcV2NullifierStatus>(
            'privacy_getNullifierStatus',
            [nullifier]
        );
        return {
            nullifier: raw.nullifier,
            isSpent: raw.is_spent,
        };
    }

    /** Returns aggregated statistics for the shielded pool from `rpc-v2`. */
    async getPoolStats(): Promise<RpcV2PoolStats> {
        const raw = await this.substrate.request<RawRpcV2PoolStats>('privacy_getPoolStats', []);
        return {
            merkleRoot: raw.merkle_root,
            commitmentCount: raw.commitment_count,
            nullifierCount: raw.nullifier_count,
            totalBalance: raw.total_balance?.toString() ?? '0',
            assetBalances: (raw.asset_balances ?? []).map(mapAssetBalance),
            treeDepth: raw.tree_depth,
        };
    }
}
