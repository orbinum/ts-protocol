export type RpcV2MerkleProof = {
    path: string[];
    leafIndex: number;
    treeDepth: number;
    treeId?: number | undefined;
};

export type PrivacyMerkleProof = RpcV2MerkleProof & { root: string };

/**
 * One page of a tree's level-6 subtree roots (`privacy_getSubtreeRoots`), with
 * the root the tree anchors to at the same state. Hex values are 32-byte
 * little-endian field elements.
 */
export type RpcV2SubtreeRoots = {
    treeId: number;
    level: number;
    /** Leaves in the tree: its capacity once sealed. */
    treeLeaves: number;
    sealed: boolean;
    root: string;
    /** Index of `roots[0]` within the level. */
    start: number;
    roots: string[];
};

export type RpcV2NullifierStatus = {
    nullifier: string;
    isSpent: boolean;
};

export type RpcV2PoolAssetBalance = {
    assetId: number;
    balance: string;
};

export type RpcV2PoolStats = {
    merkleRoot: string;
    commitmentCount: number;
    nullifierCount: number;
    totalBalance: string;
    assetBalances: RpcV2PoolAssetBalance[];
    treeDepth: number;
};
