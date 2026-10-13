/**
 * Decodes calldata for known Orbinum EVM precompiles.
 *
 * Returns raw decoded values (bigint amounts, hex strings for bytes32).
 * Callers are responsible for display formatting.
 */

import { toHex } from '../../../foundation/encoding/hex';
import { KNOWN_PRECOMPILES } from './addresses';
import { fromHex } from '../../../foundation/encoding/hex';
import { decodeUint } from './abi';

/**
 * Which shielded-pool operation a precompile call performs. Named rather than
 * left to the caller to derive from `fnSig`.
 */
export type PrecompileMethod = 'shield';

export type DecodedPrecompile = {
    fnSig: string;
    /**
     * The operation, from the selector. Null only when the args below could not
     * be decoded either — every signature this file decodes maps to a name.
     */
    method: PrecompileMethod | null;
    args: Record<string, unknown>;
};

/** The operation a function signature names, anchored at the start. */
function methodOf(fnSig: string): PrecompileMethod | null {
    if (fnSig.startsWith('shield(')) return 'shield';
    return null;
}

/**
 * Is the ABI head long enough to hold `slots` complete 32-byte words?
 *
 * `decodeUint` reads a fixed 32-byte window and substitutes `?? 0` for bytes
 * past the end, so a field that is half present decodes to a value nobody
 * encoded — 16 bytes of `0xff` followed by 16 substituted zeros reads as
 * ~1.15e77. This input comes from the CHAIN, so a truncated or hand-crafted
 * call is ordinary. An absent field is honest; a fabricated one is not.
 */
function hasFullHead(data: Uint8Array, slots: number): boolean {
    return data.length >= slots * 32;
}

/**
 * Decodes EVM calldata for a known Orbinum precompile.
 *
 * @param address - The precompile contract address (0x-prefixed).
 * @param input   - The transaction input data (0x-prefixed hex).
 * @returns Decoded `{ fnSig, args }` with raw values, or `null` if unknown.
 */
export function decodePrecompileCalldata(address: string, input: string): DecodedPrecompile | null {
    const info = KNOWN_PRECOMPILES[address.toLowerCase()];
    if (!info || !input || input.length < 10) return null;

    const selector = input.slice(2, 10).toLowerCase(); // strip 0x
    const fnSig = info.functions[selector];
    if (!fnSig) return null;

    // shield(uint32,bytes32,bytes,bytes,uint32)  — payable, amount = msg.value (NOT in calldata)
    // ABI head after selector:
    // [0-31] assetId | [32-63] commitment (bytes32) | [64-95] offset→memo
    // [96-127] offset→proof | [128-159] circuit_version
    if (fnSig.startsWith('shield(')) {
        try {
            const data = fromHex(input.slice(10));
            if (!hasFullHead(data, 5)) return { fnSig, method: methodOf(fnSig), args: {} };
            return {
                fnSig,
                method: methodOf(fnSig),
                args: {
                    assetId: decodeUint(data, 0),
                    commitment: toHex(data.slice(32, 64)),
                    circuitVersion: decodeUint(data, 128),
                },
            };
        } catch {
            return { fnSig, method: methodOf(fnSig), args: {} };
        }
    }

    return { fnSig, method: methodOf(fnSig), args: {} };
}
