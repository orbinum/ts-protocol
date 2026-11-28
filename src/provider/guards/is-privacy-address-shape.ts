/**
 * Looks like an `orbpriv3:` address: the scheme, two 32-byte hex fields and a
 * checksum. Whether the checksum matches and the keys are on the curve is the
 * wallet's check (`decodePaymentAddress`).
 */
export function isPrivacyAddressShape(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        /^orbpriv3:0x[0-9a-fA-F]{64}:0x[0-9a-fA-F]{64}:[0-9a-f]{8}$/.test(value)
    );
}
