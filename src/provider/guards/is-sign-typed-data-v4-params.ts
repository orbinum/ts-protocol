import type { HexString } from '../values/hex-string';
import { isEvmAddressShape } from './is-evm-address-shape';
import { isRecord } from './is-record';
import { MAX_TYPED_DATA_CHARS } from './limits';

/**
 * `eth_signTypedData_v4`'s params: `[address, typedData]`, the typed data as a JSON
 * string (the standard) or an object (some libraries), with the four members EIP-712
 * requires. Whether its values match its types is checked when it is hashed.
 */
export function isSignTypedDataV4Params(value: unknown): value is [HexString, string | object] {
    if (!Array.isArray(value) || value.length < 2 || !isEvmAddressShape(value[0])) return false;
    const raw: unknown = value[1];
    let typedData: unknown = raw;
    if (typeof raw === 'string') {
        if (raw.length > MAX_TYPED_DATA_CHARS) return false;
        try {
            typedData = JSON.parse(raw);
        } catch {
            return false;
        }
    }
    return (
        isRecord(typedData) &&
        isRecord(typedData['types']) &&
        typeof typedData['primaryType'] === 'string' &&
        isRecord(typedData['domain']) &&
        isRecord(typedData['message'])
    );
}
