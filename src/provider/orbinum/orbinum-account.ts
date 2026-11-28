import type { HexString } from '../values/hex-string';

/**
 * A wallet account as a publicly connected dapp sees it: one account, by its two
 * public names. In Orbinum Wallet they are the same account and one balance —
 * `substrate` is the SS58 name of `evm`'s AccountId32 (`address ‖ 0x00×12`):
 *
 * - `substrate`, what public ORB transfers pay from (`orbinum_transfer`);
 * - `evm`, what calls contracts through the EIP-1193 provider.
 */
export interface OrbinumAccount {
    substrate: string;
    evm: HexString;
    /** The name the user gave the account, when they chose to share it. */
    name?: string;
    /**
     * The account's `orbpriv3:` address, where it receives private payments. Present
     * only once the user granted this origin the `privacy` permission: it ties the
     * public accounts to the private one.
     */
    privacy?: string;
}
