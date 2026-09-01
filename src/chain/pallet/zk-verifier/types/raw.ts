/** Raw (snake_case) RPC response shapes from `zkVerifier_*` endpoints. Internal use only. */

export type RawZkVerifierVkHash = {
    version: number;
    vk_hash: string;
};

/**
 * The array fields are optional because this is what a node SENT, not what the
 * type system was promised: `request<T>()` asserts the shape and validates
 * nothing. A runtime that omits one made the mapper throw a bare TypeError.
 */
export type RawZkVerifierCircuitVersionInfo = {
    circuit_id: number;
    active_version: number;
    supported_versions?: number[];
    vk_hashes?: RawZkVerifierVkHash[];
};
