import { describe, expect, it, vi } from 'vitest';
import { ZkVerifierModule } from '../../../../src/chain/pallet/zk-verifier/ZkVerifierModule';
import type { SubstrateClient } from '../../../../src/chain/substrate/SubstrateClient';

function makeSubstrate(result: unknown): SubstrateClient {
    return { request: vi.fn().mockResolvedValue(result) } as unknown as SubstrateClient;
}

/** What the node's `zkVerifier_*` RPC returns (`CircuitVersionInfo`). */
const RAW = {
    circuit_id: 1,
    active_version: 2,
    supported_versions: [2],
    vk_hashes: [
        { version: 1, vk_hash: '0x' + '11'.repeat(32) },
        { version: 2, vk_hash: '0x' + '22'.repeat(32) },
    ],
};

describe('ZkVerifierModule', () => {
    it('maps one circuit to exactly the fields the chain reports', async () => {
        const substrate = makeSubstrate(RAW);
        const info = await new ZkVerifierModule(substrate).getCircuitVersionInfo(1);
        expect(substrate.request).toHaveBeenCalledWith('zkVerifier_getCircuitVersionInfo', [1]);
        expect(info).toEqual({
            circuitId: 1,
            activeVersion: 2,
            supportedVersions: [2],
            vkHashes: [
                { version: 1, vkHash: '0x' + '11'.repeat(32) },
                { version: 2, vkHash: '0x' + '22'.repeat(32) },
            ],
        });
    });

    it('returns null for a circuit the chain does not know', async () => {
        expect(await new ZkVerifierModule(makeSubstrate(null)).getCircuitVersionInfo(9)).toBeNull();
    });

    it('treats missing arrays as empty rather than throwing', async () => {
        const info = await new ZkVerifierModule(
            makeSubstrate({ circuit_id: 2, active_version: 1 })
        ).getCircuitVersionInfo(2);
        expect(info).toMatchObject({ supportedVersions: [], vkHashes: [] });
    });

    it('maps every circuit', async () => {
        const substrate = makeSubstrate([RAW, { ...RAW, circuit_id: 2 }]);
        const all = await new ZkVerifierModule(substrate).getAllCircuitVersions();
        expect(substrate.request).toHaveBeenCalledWith('zkVerifier_getAllCircuitVersions', []);
        expect(all.map((c) => c.circuitId)).toEqual([1, 2]);
    });
});
