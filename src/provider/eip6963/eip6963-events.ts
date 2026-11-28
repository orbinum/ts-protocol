/** A wallet dispatches this, with an `Eip6963ProviderDetail` as `detail`, to be found. */
export const EIP6963_ANNOUNCE_PROVIDER = 'eip6963:announceProvider';

/** A dapp dispatches this to ask every wallet to announce itself again. */
export const EIP6963_REQUEST_PROVIDER = 'eip6963:requestProvider';
