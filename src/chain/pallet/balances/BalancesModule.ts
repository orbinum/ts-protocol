/**
 * Native ORB balances: an account's balance and nonce (`System.Account`), and
 * transfers. Accounts are taken as SS58, AccountId32 hex or an EVM address (its
 * mapped account).
 */
import type { SignerTxCreator as SubstrateSigner } from 'polkadot-api/tx-creator';
import type { SubstrateClient } from '../../substrate/SubstrateClient';
import type { TxResult } from '../../client/types';
import { callUnsafeTx, resolveTx, signAndSubmitTx, type SubmitOptions } from '../../tx';
import { toSs58 } from '../staking/storage/reads';

type Num = bigint | number | string;
type RawAccount = {
    nonce: number;
    data: { free: Num; reserved: Num; frozen?: Num; misc_frozen?: Num; fee_frozen?: Num };
};

/** An account's native balance, in planck, and its nonce. */
export interface AccountBalance {
    free: bigint;
    reserved: bigint;
    /** What locks and freezes hold of `free`: it cannot leave the account. */
    frozen: bigint;
    nonce: number;
}

export class BalancesModule {
    constructor(private readonly substrate: SubstrateClient) {}

    /** `account`'s balance and nonce at the best block (zeros for an account never seen). */
    async account(account: string): Promise<AccountBalance> {
        const who = toSs58(account, 'balances.account');
        const query = (
            this.substrate.unsafe as unknown as {
                query: {
                    System: {
                        Account: { getValue(who: string, at: { at: 'best' }): Promise<RawAccount> };
                    };
                };
            }
        ).query;
        const { nonce, data } = await query.System.Account.getValue(who, { at: 'best' });
        const frozen = data.frozen ?? data.misc_frozen ?? 0;
        return {
            free: BigInt(data.free),
            reserved: BigInt(data.reserved),
            frozen: BigInt(frozen),
            nonce,
        };
    }

    /**
     * Sends `value` planck to `dest`, refused by the chain if it would leave the sender
     * below the existential deposit (`Balances.transfer_keep_alive`).
     */
    transferKeepAlive(
        dest: string,
        value: bigint,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ): Promise<TxResult> {
        if (typeof value !== 'bigint' || value <= 0n) {
            throw new Error(
                `balances.transferKeepAlive.value: expected a positive bigint, got ${value}`
            );
        }
        const args = { dest: toSs58(dest, 'balances.transferKeepAlive.dest'), value };
        const tx = callUnsafeTx(
            resolveTx(this.substrate.unsafe, 'Balances', 'transfer_keep_alive'),
            args
        );
        return this.substrate.trackTx(signAndSubmitTx(tx, signer, options));
    }
}
