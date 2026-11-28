/**
 * Looks like an SS58 account: base58, the length a 32-byte account encodes to. The
 * checksum and prefix are the wallet's check (`isSubstrateAddress`): verifying them
 * here would load the codec into every dapp that imports this module.
 */
export function isSs58Shape(value: unknown): value is string {
    return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{46,48}$/.test(value);
}
