import type { Eip6963ProviderDetail } from './eip6963-provider-detail';

/**
 * Whether an announcement's `detail` has the shape EIP-6963 promises. Any script on
 * the page can dispatch the event, so a dapp checks before it calls `request`.
 */
export function isEip6963ProviderDetail(value: unknown): value is Eip6963ProviderDetail {
    if (typeof value !== 'object' || value === null) return false;
    const { info, provider } = value as { info?: unknown; provider?: unknown };
    if (typeof info !== 'object' || info === null) return false;
    if (typeof provider !== 'object' || provider === null) return false;
    const fields = info as Record<string, unknown>;
    return (
        ['uuid', 'name', 'icon', 'rdns'].every((key) => typeof fields[key] === 'string') &&
        typeof (provider as { request?: unknown }).request === 'function'
    );
}
