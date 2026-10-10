/** Merkle paths a wallet builds itself; see `localPath.ts`. */
export {
    MERKLE_DEPTH,
    SUBTREE_LEVEL,
    LEAVES_PER_BLOCK,
    BLOCKS_PER_TREE,
    zeroHash,
    hashPair,
    blockPath,
    SubtreeRootTree,
    LocalPathMismatchError,
    buildLocalPath,
    verifyPath,
} from './localPath';
