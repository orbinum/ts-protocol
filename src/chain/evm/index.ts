/**
 * The EVM side of the chain.
 *
 * ```
 * EvmClient.ts   the JSON-RPC client
 * explorer/      enriched block, transaction and token queries
 * precompiles/   Orbinum's contracts, reachable from an EVM wallet
 * privateCall/   simulating and sizing a private call's steps from its executor
 * ```
 *
 * Optional throughout: a wallet that only speaks Substrate never touches this,
 * which is why `OrbinumClient.evm` is nullable rather than throwing.
 */
export { EvmClient } from './EvmClient';
export * from './explorer/index';
export * from './precompiles/index';
export * from './erc';
export {
    estimatePrivateCallGas,
    simulatePrivateCall,
    type PrivateCallStepGas,
    type PrivateCallStepResult,
} from './privateCall/index';
