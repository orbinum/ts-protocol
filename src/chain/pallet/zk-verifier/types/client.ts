/** Public (camelCase) types for `zkVerifier_*` RPC responses. */

export type ZkVerifierVkHash = {
    version: number;
    vkHash: string;
};

/**
 * One circuit's versions as the chain reports them. `supportedVersions` excludes
 * retired versions, whose keys may still be stored.
 */
export type ZkVerifierCircuitVersionInfo = {
    circuitId: number;
    activeVersion: number;
    supportedVersions: number[];
    vkHashes: ZkVerifierVkHash[];
};

/** How many proofs a verification key has checked (`ZkVerifier.VerificationStats`). */
export type ZkVerificationStats = {
    total: number;
    successful: number;
    failed: number;
};
