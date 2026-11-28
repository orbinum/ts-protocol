import type { HexString } from '../values/hex-string';
import { isHexQuantity } from './is-hex-quantity';
import { isRecord } from './is-record';

/** `wallet_switchEthereumChain`'s params: `[{ chainId }]`, the EIP-155 id in hex. */
export function isSwitchChainParams(value: unknown): value is [{ chainId: HexString }] {
    return (
        Array.isArray(value) &&
        value.length === 1 &&
        isRecord(value[0]) &&
        isHexQuantity(value[0]['chainId'])
    );
}
