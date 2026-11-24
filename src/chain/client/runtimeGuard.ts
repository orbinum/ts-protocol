import type { SubstrateClient } from '../substrate/SubstrateClient';
import type { RawRuntimeVersion } from '../substrate/types/raw';

/**
 * Oldest runtime this SDK reads and encodes for: private staking priced on rewards not
 * compounded yet, the nominator unbonding the runtime works out (`EraPruning.FastUnbond`),
 * bound spends and their signed texts.
 */
export const MIN_SPEC_VERSION = 25;

/** Throws unless the node runs `MIN_SPEC_VERSION` or later. */
export async function assertSupportedRuntime(
    substrate: Pick<SubstrateClient, 'request'>
): Promise<void> {
    const { specVersion } = await substrate.request<RawRuntimeVersion>(
        'state_getRuntimeVersion',
        []
    );
    if (!(specVersion >= MIN_SPEC_VERSION)) {
        throw new Error(
            `Unsupported runtime: spec ${specVersion}, this SDK needs spec ${MIN_SPEC_VERSION} or later`
        );
    }
}
