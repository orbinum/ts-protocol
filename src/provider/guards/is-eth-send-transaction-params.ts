import type { EthTransactionRequest } from '../eip1193/eth-transaction-request';
import { isEvmAddressShape } from './is-evm-address-shape';
import { isHexData } from './is-hex-data';
import { isHexQuantity } from './is-hex-quantity';
import { isRecord } from './is-record';
import { MAX_TRANSACTION_DATA_BYTES } from './limits';

const QUANTITIES = [
    'value',
    'gas',
    'maxFeePerGas',
    'maxPriorityFeePerGas',
    'gasPrice',
    'nonce',
    'chainId',
] as const;

/** `eth_sendTransaction`'s params: `[transaction]`, every field it carries well formed. */
export function isEthSendTransactionParams(value: unknown): value is [EthTransactionRequest] {
    if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return false;
    const tx = value[0];
    if (!isEvmAddressShape(tx['from'])) return false;
    if (tx['to'] !== undefined && tx['to'] !== null && !isEvmAddressShape(tx['to'])) return false;
    if (!QUANTITIES.every((key) => tx[key] === undefined || isHexQuantity(tx[key]))) return false;
    const { data, input } = tx;
    if (data !== undefined && !isHexData(data, MAX_TRANSACTION_DATA_BYTES)) return false;
    if (input !== undefined && !isHexData(input, MAX_TRANSACTION_DATA_BYTES)) return false;
    // Two different calldatas: which one would the user be approving?
    return data === undefined || input === undefined || data.toLowerCase() === input.toLowerCase();
}
