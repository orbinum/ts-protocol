import type { SubstrateClient } from '../substrate/SubstrateClient';
import type { RawRuntimeVersion } from '../substrate/types/raw';

/** Oldest runtime whose calls this SDK encodes: unsigned spends, `claim_fees`, no relayer pallet. */
export const MIN_SPEC_VERSION = 19;

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
