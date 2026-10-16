/**
 * Contract addresses and function selectors for all Orbinum EVM precompiles.
 *
 * Selectors are verified against the Rust source in frame/evm/precompile and
 * computed as `bytes4(keccak256("<functionName>(<argTypes>)"))`.
 */

import type { KnownPrecompileInfo } from './types';

// ─── Contract Addresses ───────────────────────────────────────────────────────

/** All precompile contract addresses. */
export const PRECOMPILE_ADDR = {
    // ── Ethereum standard (EIP) ─────────────────────────────────────────────
    EC_RECOVER: '0x0000000000000000000000000000000000000001',
    SHA256: '0x0000000000000000000000000000000000000002',
    RIPEMD160: '0x0000000000000000000000000000000000000003',
    IDENTITY: '0x0000000000000000000000000000000000000004',
    MODEXP: '0x0000000000000000000000000000000000000005',
    // ── Frontier / non-standard ─────────────────────────────────────────────
    SHA3_FIPS256: '0x0000000000000000000000000000000000000400',
    EC_RECOVER_PUBKEY: '0x0000000000000000000000000000000000000401',
    CURVE25519_ADD: '0x0000000000000000000000000000000000000402',
    CURVE25519_SCALAR_MUL: '0x0000000000000000000000000000000000000403',
    // ── Orbinum custom ───────────────────────────────────────────────────────
    SHIELDED_POOL: '0x0000000000000000000000000000000000000801',
    BALANCES: '0x0000000000000000000000000000000000000802',
} as const;

// ─── ShieldedPoolPrecompile selectors (0x0801) ────────────────────────────────
// Source: frame/evm/precompile/shielded-pool/src/lib.rs

/** Function selectors for `ShieldedPoolPrecompile`. */
export const SP_SEL = {
    // shield(uint32,bytes32,bytes,bytes,uint32) → 0xf25897e0 (payable, amount = msg.value)
    SHIELD: new Uint8Array([0xf2, 0x58, 0x97, 0xe0]),
} as const;

// ─── BalancesPrecompile selectors (0x0802) ────────────────────────────────────
// Source: frame/evm/precompile/balances/src/lib.rs

/** Function selectors for `BalancesPrecompile`. */
export const BALANCES_SEL = {
    // transfer(bytes32,uint256) → 0x6a467394
    TRANSFER: new Uint8Array([0x6a, 0x46, 0x73, 0x94]),
    // transferKeepAlive(bytes32,uint256) → 0xac6ac4c4
    TRANSFER_KEEP_ALIVE: new Uint8Array([0xac, 0x6a, 0xc4, 0xc4]),
} as const;

// ─── Known Precompiles registry ───────────────────────────────────────────────

/**
 * Registry of all known Orbinum EVM precompiles, keyed by lowercase address.
 * Covers Ethereum standard (EIP), Frontier non-standard, and Orbinum custom precompiles.
 */
export const KNOWN_PRECOMPILES: Record<string, KnownPrecompileInfo> = {
    // ── Ethereum standard (EIP) ─────────────────────────────────────────────
    '0x0000000000000000000000000000000000000001': {
        name: 'ECRecover',
        functions: { '00000000': 'ecrecover(bytes32,uint8,bytes32,bytes32)' },
    },
    '0x0000000000000000000000000000000000000002': { name: 'SHA256', functions: {} },
    '0x0000000000000000000000000000000000000003': { name: 'RIPEMD160', functions: {} },
    '0x0000000000000000000000000000000000000004': { name: 'Identity', functions: {} },
    '0x0000000000000000000000000000000000000005': { name: 'ModExp', functions: {} },
    // ── Frontier / non-standard ─────────────────────────────────────────────
    '0x0000000000000000000000000000000000000400': { name: 'SHA3FIPS256', functions: {} },
    '0x0000000000000000000000000000000000000401': { name: 'ECRecoverPublicKey', functions: {} },
    '0x0000000000000000000000000000000000000402': { name: 'Curve25519Add', functions: {} },
    '0x0000000000000000000000000000000000000403': { name: 'Curve25519ScalarMul', functions: {} },
    // ── Orbinum custom ───────────────────────────────────────────────────────
    '0x0000000000000000000000000000000000000801': {
        name: 'ShieldedPool',
        functions: {
            f25897e0: 'shield(uint32,bytes32,bytes,bytes,uint32)',
        },
    },
    '0x0000000000000000000000000000000000000802': {
        name: 'Balances',
        functions: {
            '6a467394': 'transfer(bytes32,uint256)',
            ac6ac4c4: 'transferKeepAlive(bytes32,uint256)',
        },
    },
};

/**
 * Returns the human-readable name for a known precompile address,
 * or null if the address is not a known precompile.
 */
export function getPrecompileLabel(address: string | null | undefined): string | null {
    if (!address) return null;
    return KNOWN_PRECOMPILES[address.toLowerCase()]?.name ?? null;
}
