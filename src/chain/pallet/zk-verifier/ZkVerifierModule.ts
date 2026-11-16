import type { SubstrateClient } from '../../substrate/SubstrateClient';
import type { RawZkVerifierCircuitVersionInfo, RawZkVerifierVkHash } from './types/raw';
import type {
    ZkVerificationStats,
    ZkVerifierCircuitVersionInfo,
    ZkVerifierVkHash,
} from './types/client';

function mapVkHash(raw: RawZkVerifierVkHash): ZkVerifierVkHash {
    return { version: raw.version, vkHash: raw.vk_hash };
}

function mapCircuitVersionInfo(raw: RawZkVerifierCircuitVersionInfo): ZkVerifierCircuitVersionInfo {
    return {
        circuitId: raw.circuit_id,
        activeVersion: raw.active_version,
        supportedVersions: raw.supported_versions ?? [],
        vkHashes: (raw.vk_hashes ?? []).map(mapVkHash),
    };
}

type U64 = bigint | number;
type RawStats = {
    total_verifications: U64;
    successful_verifications: U64;
    failed_verifications: U64;
};
type At = { at: 'best' };
const BEST: At = { at: 'best' };
type Reads = {
    query: {
        ZkVerifier: {
            VerificationStats: {
                getValue(circuit: number, version: number, at: At): Promise<RawStats | undefined>;
                getEntries(at: At): Promise<{ keyArgs: [number, number]; value: RawStats }[]>;
            };
            VerificationKeys: {
                getValue(
                    circuit: number,
                    version: number,
                    at: At
                ): Promise<{ system: { type: string } } | undefined>;
            };
        };
    };
};

// Counts stay far below 2^53: plain numbers a page can sum.
const stats = (raw: RawStats): ZkVerificationStats => ({
    total: Number(raw.total_verifications),
    successful: Number(raw.successful_verifications),
    failed: Number(raw.failed_verifications),
});

/**
 * Typed client for `zkVerifier_*` JSON-RPC endpoints and the pallet's storage.
 */
export class ZkVerifierModule {
    constructor(private readonly substrate: SubstrateClient) {}

    /** Returns basic version info for all registered circuits. */
    async getAllCircuitVersions(): Promise<ZkVerifierCircuitVersionInfo[]> {
        const raw = await this.substrate.request<RawZkVerifierCircuitVersionInfo[]>(
            'zkVerifier_getAllCircuitVersions',
            []
        );
        return raw.map(mapCircuitVersionInfo);
    }

    /** Returns version info for a specific circuit, or null if not found. */
    async getCircuitVersionInfo(circuitId: number): Promise<ZkVerifierCircuitVersionInfo | null> {
        const raw = await this.substrate.request<RawZkVerifierCircuitVersionInfo | null>(
            'zkVerifier_getCircuitVersionInfo',
            [circuitId]
        );
        return raw ? mapCircuitVersionInfo(raw) : null;
    }

    private get reads(): Reads {
        return this.substrate.unsafe as unknown as Reads;
    }

    /** How many proofs `circuitId` version `version`'s key checked, or null if it checked none. */
    async verificationStats(
        circuitId: number,
        version: number
    ): Promise<ZkVerificationStats | null> {
        const raw = await this.reads.query.ZkVerifier.VerificationStats.getValue(
            circuitId,
            version,
            BEST
        );
        return raw ? stats(raw) : null;
    }

    /** Every key's verification counts, by circuit and version (also keys since removed). */
    async allVerificationStats(): Promise<
        { circuitId: number; version: number; stats: ZkVerificationStats }[]
    > {
        const entries = await this.reads.query.ZkVerifier.VerificationStats.getEntries(BEST);
        return entries.map(({ keyArgs: [circuitId, version], value }) => ({
            circuitId,
            version,
            stats: stats(value),
        }));
    }

    /** The proof system `circuitId` version `version`'s key is for (`Groth16`…), or null. */
    async proofSystem(circuitId: number, version: number): Promise<string | null> {
        const info = await this.reads.query.ZkVerifier.VerificationKeys.getValue(
            circuitId,
            version,
            BEST
        );
        return info?.system.type ?? null;
    }
}
