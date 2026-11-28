import { createPageEvent } from '../page/create-page-event';
import { getPageWindow } from '../page/get-page-window';
import type { PageEvent } from '../page/page-window';
import type { Eip6963ProviderDetail } from './eip6963-provider-detail';
import { EIP6963_ANNOUNCE_PROVIDER, EIP6963_REQUEST_PROVIDER } from './eip6963-events';
import { isEip6963ProviderDetail } from './is-eip6963-provider-detail';

/**
 * Every wallet that announces itself within `timeoutMs`, one per `uuid`.
 *
 * Asks with `eip6963:requestProvider` and listens for the answers. Wallets answer
 * synchronously, so the default wait is short; it exists for a wallet whose script
 * loads after the dapp's. Off-page, the honest answer is none.
 */
export async function requestEip6963Providers(
    options: { timeoutMs?: number } = {}
): Promise<Eip6963ProviderDetail[]> {
    const page = getPageWindow();
    if (page === null) return [];
    const found = new Map<string, Eip6963ProviderDetail>();
    const onAnnounce = (event: PageEvent) => {
        if (isEip6963ProviderDetail(event.detail)) found.set(event.detail.info.uuid, event.detail);
    };
    page.addEventListener(EIP6963_ANNOUNCE_PROVIDER, onAnnounce);
    try {
        page.dispatchEvent(createPageEvent(EIP6963_REQUEST_PROVIDER));
        await new Promise((resolve) => setTimeout(resolve, options.timeoutMs ?? 200));
    } finally {
        page.removeEventListener(EIP6963_ANNOUNCE_PROVIDER, onAnnounce);
    }
    return [...found.values()];
}
