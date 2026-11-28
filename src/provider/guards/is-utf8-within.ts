/** A non-empty string whose UTF-8 encoding is at most `maxBytes`. */
export function isUtf8Within(value: unknown, maxBytes: number): value is string {
    // Each UTF-16 unit is at most 3 UTF-8 bytes: the cheap bound settles most cases
    // without encoding a string a page may have made huge.
    if (typeof value !== 'string' || value.length === 0 || value.length > maxBytes) return false;
    return value.length * 3 <= maxBytes || new TextEncoder().encode(value).length <= maxBytes;
}
