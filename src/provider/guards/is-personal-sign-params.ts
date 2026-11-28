import type { HexString } from '../values/hex-string';
import { isEvmAddressShape } from './is-evm-address-shape';
import { isUtf8Within } from './is-utf8-within';
import { MAX_SIGN_MESSAGE_BYTES } from './limits';

/**
 * `personal_sign`'s params: `[message, address]`. The message is usually hex of the
 * bytes to sign, but some libraries send the text itself; either is accepted here and
 * the wallet decodes hex before hashing.
 */
export function isPersonalSignParams(value: unknown): value is [string, HexString] {
    return (
        Array.isArray(value) &&
        value.length >= 2 &&
        isUtf8Within(value[0], MAX_SIGN_MESSAGE_BYTES * 2 + 2) &&
        isEvmAddressShape(value[1])
    );
}
