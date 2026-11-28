/**
 * How this origin is connected:
 *
 * - `none`: it is not. It may still ask for a private payment, which tells it
 *   nothing about who paid.
 * - `private`: the user connected it without sharing any account
 *   (`orbinum_requestPrivateConnection`). It may ask for private payments and
 *   calls, and for the `orbpriv3:` address, but sees no public account.
 * - `public`: it sees the selected account's public addresses
 *   (`orbinum_requestAccounts`, `eth_requestAccounts`), and may ask for anything.
 */
export type OrbinumConnection = 'none' | 'private' | 'public';

/** What the user has granted this origin. Each is asked for, and revocable, on its own. */
export interface OrbinumPermissions {
    connection: OrbinumConnection;
    /** The public accounts: `connection === 'public'`. */
    accounts: boolean;
    /** The `orbpriv3:` address beside them (`orbinum_requestPermissions`). */
    privacy: boolean;
}
