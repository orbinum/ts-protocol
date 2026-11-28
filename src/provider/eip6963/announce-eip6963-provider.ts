import { createPageEvent } from '../page/create-page-event';
import { getPageWindow } from '../page/get-page-window';
import type { Eip6963ProviderDetail } from './eip6963-provider-detail';
import { EIP6963_ANNOUNCE_PROVIDER, EIP6963_REQUEST_PROVIDER } from './eip6963-events';

/**
 * The wallet's side of EIP-6963: announces `detail` now, and again whenever a dapp
 * asks. Returns the function that stops answering. Off-page there is no one to
 * announce to, and it does nothing.
 *
 * The detail is frozen, as the EIP requires: every dapp on the page receives the
 * same object, and one must not be able to rewrite what the others see.
 */
export function announceEip6963Provider(detail: Eip6963ProviderDetail): () => void {
    const page = getPageWindow();
    if (page === null) return () => {};
    const frozen = Object.freeze({
        info: Object.freeze({ ...detail.info }),
        provider: detail.provider,
    });
    const announce = () => {
        page.dispatchEvent(createPageEvent(EIP6963_ANNOUNCE_PROVIDER, frozen));
    };
    page.addEventListener(EIP6963_REQUEST_PROVIDER, announce);
    announce();
    return () => page.removeEventListener(EIP6963_REQUEST_PROVIDER, announce);
}
