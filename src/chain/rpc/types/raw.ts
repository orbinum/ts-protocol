export type RawRpcV2MerkleProof = {
    root: string;
    path: string[];
    leaf_index: number;
    tree_depth: number;
    tree_id?: number;
};

export type RawRpcV2NullifierStatus = {
    nullifier: string;
    is_spent: boolean;
};

export type RawRpcV2PoolAssetBalance = {
    asset_id: number;
    balance: string | number;
};

/**
 * `total_balance` and `asset_balances` are optional because this is what a node
 * SENT, not what the type system was promised: `request<T>()` asserts the shape
 * and validates nothing. A runtime that omits one made the mapper throw.
 */
export type RawRpcV2PoolStats = {
    merkle_root: string;
    commitment_count: number;
    nullifier_count: number;
    total_balance?: string | number;
    asset_balances?: RawRpcV2PoolAssetBalance[];
    tree_depth: number;
};
