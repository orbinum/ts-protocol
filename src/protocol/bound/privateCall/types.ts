import type { FieldKey } from '../fields/index';

/** One EVM call a private call's executor makes. */
export interface PrivateCallStep {
    /** The contract called, 0x-prefixed 20-byte hex. */
    target: string;
    /** The calldata. */
    input: Uint8Array;
    /** ORB sent with the call, in planck. */
    value: bigint;
}

/** What a private call does: everything in its request but the key of the note it mints. */
export interface PrivateCallTerms {
    /** The last block the call runs in. */
    deadline: number;
    /** Gas for all the steps together; the spend's fee pays all of it. */
    gasLimit: bigint;
    steps: PrivateCallStep[];
    /** The least ORB, in planck, the executor must hold after the steps. */
    minReturn: bigint;
}

/**
 * A private call (`evm::private_call::Request`): the executor makes each step's call,
 * then everything it holds is minted as one note to `ownerPk`/`blinding` — what came
 * back, or the whole spend when a step fails or less than `minReturn` came back.
 */
export interface PrivateCallRequest extends PrivateCallTerms {
    ownerPk: FieldKey;
    blinding: FieldKey;
}
