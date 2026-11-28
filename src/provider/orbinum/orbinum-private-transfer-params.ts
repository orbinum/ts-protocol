import type { PlanckString } from '../values/planck-string';

/**
 * `orbinum_privateTransfer`: a private payment from the account's shielded balance.
 * Nothing on chain links it to the payer; the dapp gets a payment proof instead.
 *
 * Any origin may ask, connected or not: a site that is not connected, or is
 * connected privately, learns nothing about who paid. The user chooses what the
 * recipient is told about the sender — nothing (the default) or a pseudonym —
 * when approving, never the site. Not the `orbpriv3:` address: a merchant checks
 * the proof with its public address alone, which cannot prove a sender named by
 * address (`checkPaymentProof` refuses it). A site that wants the payer's private
 * address asks for the `privacy` permission instead.
 */
export interface OrbinumPrivateTransferParams {
    /** The recipient's `orbpriv3:` address. */
    to: string;
    /** More than zero. */
    value: PlanckString;
}
