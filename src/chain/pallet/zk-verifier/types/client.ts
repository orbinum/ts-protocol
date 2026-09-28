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
