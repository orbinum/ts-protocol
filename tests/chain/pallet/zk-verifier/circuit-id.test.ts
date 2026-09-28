import { describe, it, expect } from 'vitest';
import { CircuitId } from '../../../../src/chain/pallet/zk-verifier/types/circuitId';

/**
 * Anti-drift guard: the SDK's CircuitId constants MUST match the node's
 * `CircuitId` (node/frame/zk-verifier/src/types.rs): TRANSFER=1, UNSHIELD=2.
 * A wrong id makes getCircuitVersionInfo query a circuit that does not exist.
 */
describe('CircuitId (SDK ↔ node)', () => {
    it('matches the node circuit ids exactly', () => {
        expect(CircuitId).toEqual({ Transfer: 1, Unshield: 2 });
    });

    // 5 (private_link) and 6 (value_proof) are retired on-chain. Reintroducing
    // either without a node-side circuit would let the SDK ask for proofs the
    // runtime cannot verify.
    it('does not expose a retired circuit', () => {
        expect(Object.values(CircuitId)).not.toContain(5);
        expect(Object.values(CircuitId)).not.toContain(6);
    });
});
