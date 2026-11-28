/**
 * A type-2 transaction's payload, in the order EIP-1559 fixes. Shared by the hash a
 * wallet signs and the serialisation it submits, so the two can never disagree.
 */
import { fromHex, isHexOfLength } from '../../../foundation/encoding/hex';
import type { Eip1559Transaction } from './eip1559-transaction';
import { quantityBytes } from './quantity-bytes';
import type { RlpInput } from './rlp-encode';

/** The fields of `tx` as RLP items, checked: a malformed field throws, naming it. */
export function eip1559Fields(tx: Eip1559Transaction): RlpInput[] {
    return [
        quantityBytes(tx.chainId, 'tx.chainId'),
        quantityBytes(tx.nonce, 'tx.nonce'),
        quantityBytes(tx.maxPriorityFeePerGas, 'tx.maxPriorityFeePerGas'),
        quantityBytes(tx.maxFeePerGas, 'tx.maxFeePerGas'),
        quantityBytes(tx.gas, 'tx.gas'),
        tx.to === null ? new Uint8Array(0) : addressBytes(tx.to, 'tx.to'),
        quantityBytes(tx.value, 'tx.value'),
        dataBytes(tx.data),
        (tx.accessList ?? []).map((entry, i) => [
            addressBytes(entry.address, `tx.accessList[${i}].address`),
            entry.storageKeys.map((key, k) => {
                if (!isHexOfLength(key, 32)) {
                    throw new Error(
                        `tx.accessList[${i}].storageKeys[${k}]: expected 32 bytes of 0x hex`
                    );
                }
                return fromHex(key);
            }),
        ]),
    ];
}

function addressBytes(address: string, where: string): Uint8Array {
    if (!isHexOfLength(address, 20)) {
        throw new Error(`${where}: expected a 20-byte 0x address, got ${address}`);
    }
    return fromHex(address);
}

function dataBytes(data: string): Uint8Array {
    if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) {
        throw new Error('tx.data: expected 0x-prefixed hex of whole bytes');
    }
    return fromHex(data);
}
