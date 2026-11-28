import type { Eip1193Provider } from '../eip1193/eip1193-provider';
import type { Eip6963ProviderInfo } from './eip6963-provider-info';

/** One announced wallet: who it is, and its EIP-1193 provider. */
export interface Eip6963ProviderDetail {
    readonly info: Eip6963ProviderInfo;
    readonly provider: Eip1193Provider;
}
