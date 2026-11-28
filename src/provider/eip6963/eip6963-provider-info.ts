/** How a wallet presents itself in EIP-6963 discovery. */
export interface Eip6963ProviderInfo {
    /** A UUIDv4, new on every page load: tells two announcements of one wallet apart. */
    readonly uuid: string;
    /** The wallet's name, for a picker. */
    readonly name: string;
    /** A `data:` URI image, square, at least 96×96. */
    readonly icon: string;
    /** Reverse-DNS id, stable across loads: how a dapp recognises the wallet. */
    readonly rdns: string;
}
