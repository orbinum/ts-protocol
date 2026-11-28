import { keccak_256 } from '@noble/hashes/sha3.js';
import { concatBytes } from '../transaction/concat-bytes';
import type { TypedData, TypedDataField } from './typed-data';
import { typedDataStructHash } from './typed-data-struct-hash';

/** The domain members EIP-712 defines, in the order a derived `EIP712Domain` lists them. */
const DOMAIN_FIELDS: TypedDataField[] = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
    { name: 'salt', type: 'bytes32' },
];

/**
 * The 32 bytes `eth_signTypedData_v4` signs:
 * `keccak256(0x19 0x01 ‖ domainSeparator ‖ hashStruct(primaryType, message))`.
 *
 * `EIP712Domain` is taken from `types` when the dapp sent it, and otherwise derived
 * from the members `domain` has. With `primaryType: 'EIP712Domain'` the message part
 * is left out, as the reference implementations do.
 */
export function typedDataHash(typedData: TypedData): Uint8Array {
    const types = {
        ...typedData.types,
        EIP712Domain:
            typedData.types['EIP712Domain'] ??
            DOMAIN_FIELDS.filter((field) => typedData.domain[field.name] !== undefined),
    };
    const domainSeparator = typedDataStructHash(
        'EIP712Domain',
        typedData.domain,
        types,
        'typedData.domain'
    );
    const parts = [Uint8Array.of(0x19, 0x01), domainSeparator];
    if (typedData.primaryType !== 'EIP712Domain') {
        parts.push(
            typedDataStructHash(
                typedData.primaryType,
                typedData.message,
                types,
                'typedData.message'
            )
        );
    }
    return keccak_256(concatBytes(parts));
}
