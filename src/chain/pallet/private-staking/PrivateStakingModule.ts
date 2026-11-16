import type { SignerTxCreator as SubstrateSigner } from 'polkadot-api/tx-creator';
import type { SubstrateClient } from '../../substrate/SubstrateClient';
import type { TxResult } from '../../client/types';
import { callUnsafeTx, resolveTx, signAndSubmitTx, type SubmitOptions } from '../../tx';
import { ProtocolRefusal } from '../../refusal';
import { signerAccount } from '../signerAccount';
import { assertU32 } from '../staking/calls/callArgs';
import {
    readIsPoolMember,
    readMinJoinBond,
    readPool,
    readPoolsConfig,
} from '../nomination-pools/storage/reads';
import { privateMemberAddress } from './account';
import { privateExitRefusal } from './redeem';
import {
    readActiveEra,
    readEntryQueueFull,
    readExitUnbondingEras,
    readMaxPointsToBalance,
    readMinPrivateEntry,
    readPrivateExitState,
    readPrivatePool,
    readPrivatePoolOfAsset,
    readPrivatePools,
    readPrivateQuote,
} from './storage/reads';
import type {
    PrivateEntryRefusal,
    PrivateExitRefusal,
    PrivatePool,
    PrivatePoolQuote,
} from './types/index';

/**
 * Private staking (runtime spec 22): nomination pools joined with shielded notes.
 *
 * A pool's root opens it (`setPrivate`); the pallet then holds one membership in it and
 * issues a share asset whose notes are shares of that membership. Entering and leaving
 * are unsigned bound spends (`ShieldedPoolModule.boundSpend`) the wallet builds; this
 * module reads what they need and signs the root's switch.
 */
export class PrivateStakingModule {
    constructor(private readonly substrate: SubstrateClient) {}

    /** Pool `poolId`'s private side, or null if its root never opened it. */
    pool(poolId: number): Promise<PrivatePool | null> {
        return readPrivatePool(this.substrate, poolId);
    }

    /** Every pool ever opened to private members. */
    pools(): Promise<PrivatePool[]> {
        return readPrivatePools(this.substrate);
    }

    /** The pool a share asset belongs to, or null for any other asset. */
    poolOfAsset(assetId: number): Promise<number | null> {
        return readPrivatePoolOfAsset(this.substrate, assetId);
    }

    /** The smallest private entry, in planck. */
    minEntry(): Promise<bigint> {
        return readMinPrivateEntry(this.substrate);
    }

    /** What prices pool `poolId`'s shares now (`privateShareValue`, `privateMinFeeShares`). */
    quote(poolId: number): Promise<PrivatePoolQuote | null> {
        return readPrivateQuote(this.substrate, poolId);
    }

    /** Eras an exit waits before its ORB is minted (the nominator unbonding). */
    exitUnbondingEras(): Promise<number> {
        return readExitUnbondingEras(this.substrate);
    }

    /** The pool's private member: the account a bound spend into it pays. */
    memberAddress(poolId: number): string {
        return privateMemberAddress(poolId);
    }

    /**
     * What the chain would refuse an entry of `amount` into pool `poolId` with, or null.
     * Checked before proving: the pool open to private members and to new members, not
     * slashed past `MaxPointsToBalance`, the private minimum, for its first private
     * member the pool's join minimum and member limits, and room in this era's entries.
     */
    async entryRefusal(poolId: number, amount: bigint): Promise<PrivateEntryRefusal | null> {
        const [privatePool, pool, minEntry, maxPointsToBalance] = await Promise.all([
            this.pool(poolId),
            readPool(this.substrate, poolId),
            this.minEntry(),
            readMaxPointsToBalance(this.substrate),
        ]);
        if (!pool) return 'NoSuchPool';
        if (!privatePool?.enabled || privatePool.windDown) return 'NotPrivate';
        if (pool.state !== 'Open') return 'PoolNotOpen';
        if (
            pool.points > 0n &&
            (pool.balance === 0n || pool.points / pool.balance >= BigInt(maxPointsToBalance))
        ) {
            return 'PoolSlashed';
        }
        if (amount < minEntry) return 'BelowMinimum';
        if (!(await readIsPoolMember(this.substrate, privateMemberAddress(poolId)))) {
            const [minJoinBond, config] = await Promise.all([
                readMinJoinBond(this.substrate),
                readPoolsConfig(this.substrate),
            ]);
            if (amount < minJoinBond) return 'BelowMinimum';
            const perPool = config.maxPoolMembersPerPool;
            const total = config.maxPoolMembers;
            if (
                (perPool !== null && pool.memberCount >= perPool) ||
                (total !== null && config.memberCount >= total)
            ) {
                return 'TooManyMembers';
            }
        }
        const era = await readActiveEra(this.substrate);
        return (await readEntryQueueFull(this.substrate, poolId, era)) ? 'QueueFull' : null;
    }

    /**
     * What the chain would refuse an exit of `shares` from pool `poolId` with, paying `fee`
     * shares and asking at least `minValue` planck, or null (`privateExitRefusal`).
     * Checked before proving.
     */
    async exitRefusal(
        poolId: number,
        shares: bigint,
        fee: bigint,
        minValue: bigint
    ): Promise<PrivateExitRefusal | null> {
        const state = await readPrivateExitState(this.substrate, poolId);
        return state ? privateExitRefusal(state, shares, fee, minValue) : 'NoSuchPool';
    }

    /**
     * Opens pool `poolId` to new private entries, or closes it (exits never close). Root
     * only; the first opening issues the pool's share asset. Refused before signing when
     * the signer is not the root, the pool is destroying or its private side wound down
     * (opening), or it was never opened (closing). EVM and Solana roots sign it as text
     * from runtime spec 22.
     */
    async setPrivate(
        poolId: number,
        enabled: boolean,
        signer: SubstrateSigner,
        options?: SubmitOptions
    ): Promise<TxResult> {
        assertU32(poolId, 'privateStaking.setPrivate.poolId');
        if (typeof enabled !== 'boolean') throw new Error('setPrivate: enabled must be a boolean');
        const [pool, privatePool] = await Promise.all([
            readPool(this.substrate, poolId),
            this.pool(poolId),
        ]);
        if (!pool) {
            throw new ProtocolRefusal('setPrivate', 'NoSuchPool', `setPrivate: no pool ${poolId}`, {
                poolId,
            });
        }
        const who = signerAccount(signer);
        if (who !== null && pool.roles.root !== who) {
            throw new ProtocolRefusal('setPrivate', 'NotRoot', 'setPrivate: NotRoot', { poolId });
        }
        // A wound-down private side only pays out until the chain forgets it.
        if (enabled && (pool.state === 'Destroying' || privatePool?.windDown)) {
            throw new ProtocolRefusal('setPrivate', 'PoolNotOpen', 'setPrivate: PoolNotOpen', {
                poolId,
            });
        }
        if (!enabled && !privatePool) {
            throw new ProtocolRefusal('setPrivate', 'NotPrivate', 'setPrivate: NotPrivate', {
                poolId,
            });
        }
        const entry = resolveTx(this.substrate.unsafe, 'PrivateStaking', 'set_private');
        const tx = callUnsafeTx(entry, { pool_id: poolId, enabled });
        return signAndSubmitTx(tx, signer, options);
    }
}
