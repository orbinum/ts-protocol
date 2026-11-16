/**
 * A validator's session keys as `Session.set_keys` takes them and `author_rotateKeys`
 * returns them: the Aura key, then the GRANDPA key, 32 bytes each.
 */

/** The two keys in a 64-byte session keys blob (0x hex), lowercase, or null. */
export function decodeSessionKeys(keys: string): { aura: string; grandpa: string } | null {
    if (typeof keys !== 'string' || !/^0x[0-9a-fA-F]{128}$/.test(keys)) return null;
    const hex = keys.toLowerCase();
    return { aura: `0x${hex.slice(2, 66)}`, grandpa: `0x${hex.slice(66)}` };
}
