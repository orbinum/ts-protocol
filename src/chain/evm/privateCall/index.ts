/**
 * A private call's steps run from the executor before it is proved: its fee is paid even
 * when a step fails, so a wallet simulates each step (`simulatePrivateCall`) and sizes
 * its gas (`estimatePrivateCallGas`) first. Steps are called one by one on the same
 * state, not in sequence.
 */
export { simulatePrivateCall, type PrivateCallStepResult } from './simulate';
export { estimatePrivateCallGas, type PrivateCallStepGas } from './estimate';
