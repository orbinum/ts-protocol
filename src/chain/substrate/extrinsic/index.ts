/**
 * Naming the positional fields of a decoded extrinsic or event.
 *
 * A Substrate/PAPI node returns `arg0`, `arg1`, … when metadata-based decoding
 * is unavailable. These two tables map those positions onto the field names the
 * pallets declare, so a caller reads `nullifier` instead of `arg2`.
 *
 * BEST EFFORT, BY METHOD NAME ONLY. Neither helper is given the pallet section,
 * so two pallets that declare the same method name are indistinguishable here —
 * see the `Executed` note below. A consumer that needs certainty decodes
 * against metadata instead.
 *
 * `events.ts` is the canonical model of the shielded-pool events; this file is
 * a display convenience and does not replace it.
 */

import { formatBalance } from '../../../foundation/text/format';

// ─────────────────────────────────────────────────────────────────────────────
// PARSERS & MAPPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps raw extrinsic args to semantic field names for a given pallet
 * section/method.
 *
 * Decoders name args differently: PAPI keeps the metadata's snake_case
 * (`merkle_roots`), polkadot.js camelCases them (`merkleRoots`), others go
 * positional (`arg1`, `1`). Every form is accepted, so a decoder change never
 * drops a field in silence.
 *
 * @param section - Pallet name (e.g. `'shieldedPool'`).
 * @param method  - Call name (e.g. `'shield'`).
 * @param args    - Raw args object from the node.
 * @returns Remapped args with semantic keys, or the original object if unknown.
 */
export function mapExtrinsicArgs(
    section: string,
    method: string,
    args: Record<string, unknown>
): Record<string, unknown> {
    if (!args || Object.keys(args).length === 0) return args;

    const s = section.toLowerCase();
    const m = method.toLowerCase();

    const get = (idx: number, name: string) => {
        if (name in args) return args[name];
        const camel = name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        if (camel in args) return args[camel];
        const argKey = `arg${idx}`;
        if (argKey in args) return args[argKey];
        if (idx in args) return args[idx];
        const strIdx = idx.toString();
        if (strIdx in args) return args[strIdx];
        return undefined;
    };

    if (s === 'system') {
        const m_norm = m.replace(/_/g, '');
        if (m_norm === 'remark' || m_norm === 'remarkwithevent') {
            return { remark: get(0, 'remark') };
        }
        if (m_norm === 'setheappages') {
            return { pages: get(0, 'pages') };
        }
        if (m_norm === 'setcode' || m_norm === 'setcodewithoutchecks') {
            return { code: get(0, 'code') };
        }
        if (m_norm === 'setstorage') {
            return { items: get(0, 'items') };
        }
        if (m_norm === 'killstorage') {
            return { keys: get(0, 'keys') };
        }
        if (m_norm === 'killprefix') {
            return {
                prefix: get(0, 'prefix'),
                subkeys: get(1, 'subkeys'),
            };
        }
        if (m_norm === 'authorizeupgrade' || m_norm === 'authorizeupgradewithoutchecks') {
            return { code_hash: get(0, 'code_hash') };
        }
        if (m_norm === 'applyauthorizedupgrade') {
            return { code: get(0, 'code') };
        }
    }

    if (s === 'timestamp') {
        if (m === 'set') {
            return { now: get(0, 'now') };
        }
    }

    if (s === 'balances') {
        const m_norm = m.replace(/_/g, '');
        if (m_norm.startsWith('transfer')) {
            return {
                recipient: get(0, 'dest'),
                amount: get(1, 'value'),
            };
        }
        if (m_norm === 'forcetransfer') {
            return {
                source: get(0, 'source'),
                dest: get(1, 'dest'),
                value: get(2, 'value'),
            };
        }
        if (m_norm === 'forceunreserve') {
            return {
                who: get(0, 'who'),
                amount: get(1, 'amount'),
            };
        }
        if (m_norm === 'upgradeaccounts') {
            return { who: get(0, 'who') };
        }
        if (m_norm === 'forcesetbalance') {
            return {
                who: get(0, 'who'),
                new_free: get(1, 'new_free'),
            };
        }
        if (m_norm === 'forceadjusttotalissuance') {
            return {
                direction: get(0, 'direction'),
                delta: get(1, 'delta'),
            };
        }
        if (m_norm === 'burn') {
            return {
                value: get(0, 'value'),
                keep_alive: get(1, 'keep_alive'),
            };
        }
    }

    if (s === 'sudo') {
        const m_norm = m.replace(/_/g, '');
        if (m_norm === 'sudo') {
            return { call: get(0, 'call') };
        }
        if (m_norm === 'sudouncheckedweight') {
            return {
                call: get(0, 'call'),
                weight: get(1, 'weight'),
            };
        }
        if (m_norm === 'setkey') {
            return { new: get(0, 'new') };
        }
        if (m_norm === 'sudoas') {
            return {
                who: get(0, 'who'),
                call: get(1, 'call'),
            };
        }
    }

    if (s === 'grandpa') {
        const m_norm = m.replace(/_/g, '');
        if (m_norm === 'reportequivocation' || m_norm === 'reportequivocationunsigned') {
            return {
                equivocation_proof: get(0, 'equivocation_proof'),
                key_owner_proof: get(1, 'key_owner_proof'),
            };
        }
        if (m_norm === 'notestalled') {
            return {
                delay: get(0, 'delay'),
                best_finalized_block_number: get(1, 'best_finalized_block_number'),
            };
        }
    }

    if (s === 'shieldedpool') {
        const m_norm = m.replace(/_/g, '');
        if (m_norm === 'shield') {
            return {
                asset_id: get(0, 'asset_id'),
                amount: get(1, 'amount'),
                commitment: get(2, 'commitment'),
                encrypted_memo: get(3, 'encrypted_memo'),
                proof: get(4, 'proof'),
                circuit_version: get(5, 'circuit_version'),
            };
        }
        if (m_norm === 'shieldbatch') {
            const ops = get(0, 'operations');
            if (Array.isArray(ops)) {
                return {
                    operations: ops.map((op) => {
                        if (Array.isArray(op)) {
                            return {
                                asset_id: op[0],
                                amount: op[1],
                                commitment: op[2],
                                encrypted_memo: op[3],
                                proof: op[4],
                                circuit_version: op[5],
                            };
                        }
                        return op;
                    }),
                };
            }
            return { operations: ops };
        }
        if (m_norm === 'privatetransfer') {
            const roots = get(1, 'merkle_roots');
            const single = get(-1, 'merkle_root');
            const rootArgs =
                single !== undefined && roots === undefined
                    ? { merkle_root: single }
                    : Array.isArray(roots)
                      ? { merkle_roots: roots }
                      : { merkle_root: get(1, 'merkle_root') };
            return {
                proof: get(0, 'proof'),
                ...rootArgs,
                nullifiers: get(2, 'nullifiers'),
                commitments: get(3, 'commitments'),
                encrypted_memos: get(4, 'encrypted_memos'),
                asset_id: get(5, 'asset_id'),
                fee: get(6, 'fee'),
                circuit_version: get(7, 'circuit_version'),
            };
        }
        if (m_norm === 'unshield') {
            return {
                proof: get(0, 'proof'),
                merkle_root: get(1, 'merkle_root'),
                nullifier: get(2, 'nullifier'),
                asset_id: get(3, 'asset_id'),
                amount: get(4, 'amount'),
                recipient: get(5, 'recipient'),
                fee: get(6, 'fee'),
                change_commitment: get(7, 'change_commitment'),
                change_encrypted_memo: get(8, 'change_encrypted_memo'),
                circuit_version: get(9, 'circuit_version'),
            };
        }
        if (m_norm === 'commitrelay') {
            return { commits: get(0, 'commits') };
        }
        if (m_norm === 'claimrelayfees') {
            return { asset_id: get(0, 'asset_id'), amount: get(1, 'amount') };
        }
        if (m_norm === 'registerasset') {
            return {
                name: get(0, 'name'),
                symbol: get(1, 'symbol'),
                decimals: get(2, 'decimals'),
                contract_address: get(3, 'contract_address'),
            };
        }
        if (m_norm === 'verifyasset') {
            return { asset_id: get(0, 'asset_id') };
        }
        if (m_norm === 'unverifyasset') {
            return { asset_id: get(0, 'asset_id') };
        }
    }

    if (s === 'ethereum' && m === 'transact') {
        return { transaction: get(0, 'transaction') };
    }

    if (s === 'evm') {
        if (m === 'withdraw') {
            return {
                address: get(0, 'address'),
                value: get(1, 'value'),
            };
        }
        if (m === 'call') {
            return {
                source: get(0, 'source'),
                target: get(1, 'target'),
                input: get(2, 'input'),
                value: get(3, 'value'),
                gas_limit: get(4, 'gas_limit'),
                max_fee_per_gas: get(5, 'max_fee_per_gas'),
                max_priority_fee_per_gas: get(6, 'max_priority_fee_per_gas'),
                nonce: get(7, 'nonce'),
                access_list: get(8, 'access_list'),
                authorization_list: get(9, 'authorization_list'),
            };
        }
        if (m === 'create') {
            return {
                source: get(0, 'source'),
                init: get(1, 'init'),
                value: get(2, 'value'),
                gas_limit: get(3, 'gas_limit'),
                max_fee_per_gas: get(4, 'max_fee_per_gas'),
                max_priority_fee_per_gas: get(5, 'max_priority_fee_per_gas'),
                nonce: get(6, 'nonce'),
                access_list: get(7, 'access_list'),
                authorization_list: get(8, 'authorization_list'),
            };
        }
        if (m === 'create2') {
            return {
                source: get(0, 'source'),
                init: get(1, 'init'),
                salt: get(2, 'salt'),
                value: get(3, 'value'),
                gas_limit: get(4, 'gas_limit'),
                max_fee_per_gas: get(5, 'max_fee_per_gas'),
                max_priority_fee_per_gas: get(6, 'max_priority_fee_per_gas'),
                nonce: get(7, 'nonce'),
                access_list: get(8, 'access_list'),
                authorization_list: get(9, 'authorization_list'),
            };
        }
    }

    if (s === 'zkverifier') {
        const m_norm = m.replace(/_/g, '');
        if (m_norm === 'batchregisterverificationkeys') {
            const entries = get(0, 'entries');
            if (Array.isArray(entries)) {
                return {
                    entries: entries.map((e: Record<string, unknown>) => ({
                        circuit_id: e['circuit_id'],
                        version: e['version'],
                        verification_key: e['verification_key'],
                        set_active: e['set_active'],
                    })),
                };
            }
            return { entries };
        }
        if (m_norm === 'registerverificationkey') {
            return {
                circuit_id: get(0, 'circuit_id'),
                version: get(1, 'version'),
                verification_key: get(2, 'verification_key'),
            };
        }
        if (m_norm === 'setactiveversion') {
            return {
                circuit_id: get(0, 'circuit_id'),
                version: get(1, 'version'),
            };
        }
        if (
            m_norm === 'removeverificationkey' ||
            m_norm === 'retireversion' ||
            m_norm === 'unretireversion'
        ) {
            return {
                circuit_id: get(0, 'circuit_id'),
                version: get(1, 'version'),
            };
        }
        if (m_norm === 'purgecircuit') {
            return { circuit_id: get(0, 'circuit_id') };
        }
        if (m_norm === 'verifyproof') {
            return {
                circuit_id: get(0, 'circuit_id'),
                proof: get(1, 'proof'),
                public_inputs: get(2, 'public_inputs'),
            };
        }
    }

    return args;
}

/**
 * Maps raw event data fields (which may use positional keys) to semantic names
 * for shielded-pool, zk-verifier, evm, ethereum and system events.
 *
 * @param method - Event name (e.g. `'shielded'`, `'unshielded'`).
 * @param data   - Raw event data fields.
 * @returns Remapped data with semantic keys, or the original object if unknown.
 */
export function mapZkEventData(
    method: string,
    data: Record<string, unknown>
): Record<string, unknown> {
    const m = method.toLowerCase();

    const get = (idx: number, name: string) => {
        if (name in data) return data[name];
        const argKey = `arg${idx}`;
        if (argKey in data) return data[argKey];
        if (idx in data) return data[idx];
        const strIdx = idx.toString();
        if (strIdx in data) return data[strIdx];
        return undefined;
    };

    const formatAmount = (val: unknown): string | null => {
        if (val === undefined || val === null) return null;
        return formatBalance(String(val));
    };

    const m_norm = m.replace(/_/g, '');

    // ── shielded-pool events ─────────────────────────────────────────────────

    if (m_norm === 'shielded') {
        return {
            sender: get(0, 'depositor'),
            amount: formatAmount(get(1, 'amount')),
            commitment: get(2, 'commitment'),
            memo: get(3, 'encrypted_memo'),
            index: get(4, 'leaf_index'),
        };
    }

    // A private transfer emits TWO events, never one: the pallet splits
    // `NullifiersSpent` from `CommitmentsInserted` on purpose, so an observer
    // cannot pair inputs with outputs.
    if (m_norm === 'nullifiersspent') {
        return { nullifiers: get(0, 'nullifiers') };
    }

    if (m_norm === 'commitmentsinserted') {
        return {
            commitments: get(0, 'commitments'),
            memos: get(1, 'encrypted_memos'),
            indices: get(2, 'leaf_indices'),
        };
    }

    if (m_norm === 'unshielded') {
        return {
            nullifier: get(0, 'nullifier'),
            amount: formatAmount(get(1, 'amount')),
            recipient: get(2, 'recipient'),
            change_commitment: get(3, 'change_commitment'),
            change_memo: get(4, 'change_encrypted_memo'),
            change_index: get(5, 'change_leaf_index'),
        };
    }

    if (m_norm === 'merklerootupdated') {
        return {
            old_root: get(0, 'old_root'),
            new_root: get(1, 'new_root'),
            size: get(2, 'tree_size'),
        };
    }

    if (m_norm === 'treesealed') {
        return {
            tree_id: get(0, 'tree_id'),
            final_root: get(1, 'final_root'),
            first_leaf_index: get(2, 'first_leaf_index'),
            leaf_count: get(3, 'leaf_count'),
        };
    }

    if (m_norm === 'relayfeesclaimed') {
        return {
            who: get(0, 'who'),
            to: get(1, 'to'),
            asset_id: get(2, 'asset_id'),
            amount: formatAmount(get(3, 'amount')),
        };
    }

    if (m_norm === 'assetregistered') {
        return { asset_id: get(0, 'asset_id') };
    }

    if (m_norm === 'assetverified') {
        return { asset_id: get(0, 'asset_id') };
    }

    if (m_norm === 'assetunverified') {
        return { asset_id: get(0, 'asset_id') };
    }

    // ── zk-verifier events ───────────────────────────────────────────────────

    if (
        m_norm === 'verificationkeyregistered' ||
        m_norm === 'activeversionset' ||
        m_norm === 'verificationkeyremoved' ||
        m_norm === 'versionretired' ||
        m_norm === 'versionunretired' ||
        m_norm === 'proofverified' ||
        m_norm === 'proofverificationfailed'
    ) {
        return {
            circuit_id: get(0, 'circuit_id'),
            version: get(1, 'version'),
        };
    }

    if (m_norm === 'circuitpurged') {
        return { circuit_id: get(0, 'circuit_id'), removed: get(1, 'removed') };
    }

    if (m_norm === 'batchverificationkeysregistered') {
        return { count: get(0, 'count') };
    }

    // ── evm events ───────────────────────────────────────────────────────────

    if (m_norm === 'log') {
        return { log: get(0, 'log') };
    }

    if (m_norm === 'created' || m_norm === 'createdfailed' || m_norm === 'executedfailed') {
        return { address: get(0, 'address') };
    }

    // ── ethereum events ───────────────────────────────────────────────────────

    // `Executed` is declared by BOTH pallets, with different shapes:
    // `pallet-evm` as `{ address }`, `pallet-ethereum` as
    // `{ from, to, transaction_hash, exit_reason }`. Without the section there
    // is no way to tell them apart, so the richer shape wins — its fields are
    // read by name first, and an evm-only event simply resolves `from` from
    // `address` and leaves the rest undefined.
    if (m_norm === 'executed') {
        return {
            from: get(0, 'from') ?? get(0, 'address'),
            to: get(1, 'to'),
            transaction_hash: get(2, 'transaction_hash'),
            exit_reason: get(3, 'exit_reason'),
        };
    }

    // ── system events ────────────────────────────────────────────────────────

    if (m_norm === 'extrinsicsuccess') {
        return { dispatch_info: get(0, 'dispatch_info') };
    }

    if (m_norm === 'extrinsicfailed') {
        return {
            dispatch_error: get(0, 'dispatch_error'),
            dispatch_info: get(1, 'dispatch_info'),
        };
    }

    if (m_norm === 'newaccount' || m_norm === 'killedaccount') {
        return { account: get(0, 'account') };
    }

    if (m_norm === 'remarked') {
        return {
            sender: get(0, 'sender'),
            hash: get(1, 'hash'),
        };
    }

    if (m_norm === 'upgradeauthorized') {
        return {
            code_hash: get(0, 'code_hash'),
            check_version: get(1, 'check_version'),
        };
    }

    if (m_norm === 'rejectedinvalidauthorizedupgrade') {
        return {
            code_hash: get(0, 'code_hash'),
            error: get(1, 'error'),
        };
    }

    // ── balances events ───────────────────────────────────────────────────────

    if (m_norm === 'endowed') {
        return {
            account: get(0, 'account'),
            free_balance: get(1, 'free_balance'),
        };
    }

    if (m_norm === 'dustlost') {
        return {
            account: get(0, 'account'),
            amount: get(1, 'amount'),
        };
    }

    if (m_norm === 'transfer') {
        return {
            from: get(0, 'from'),
            to: get(1, 'to'),
            amount: get(2, 'amount'),
        };
    }

    if (m_norm === 'balanceset') {
        return {
            who: get(0, 'who'),
            free: get(1, 'free'),
        };
    }

    if (
        m_norm === 'reserved' ||
        m_norm === 'unreserved' ||
        m_norm === 'deposit' ||
        m_norm === 'withdraw' ||
        m_norm === 'slashed' ||
        m_norm === 'minted' ||
        m_norm === 'burned' ||
        m_norm === 'suspended' ||
        m_norm === 'restored' ||
        m_norm === 'locked' ||
        m_norm === 'unlocked' ||
        m_norm === 'frozen' ||
        m_norm === 'thawed'
    ) {
        return {
            who: get(0, 'who'),
            amount: get(1, 'amount'),
        };
    }

    if (m_norm === 'reserverepatriated') {
        return {
            from: get(0, 'from'),
            to: get(1, 'to'),
            amount: get(2, 'amount'),
            destination_status: get(3, 'destination_status'),
        };
    }

    if (m_norm === 'upgraded') {
        return { who: get(0, 'who') };
    }

    if (m_norm === 'issued' || m_norm === 'rescinded') {
        return { amount: get(0, 'amount') };
    }

    if (m_norm === 'totalissuanceforced') {
        return {
            old: get(0, 'old'),
            new: get(1, 'new'),
        };
    }

    // ── sudo events ───────────────────────────────────────────────────────────

    if (m_norm === 'sudid' || m_norm === 'sudoasdone') {
        return { sudo_result: get(0, 'sudo_result') };
    }

    if (m_norm === 'keychanged') {
        return {
            old: get(0, 'old'),
            new: get(1, 'new'),
        };
    }

    // ── grandpa events ────────────────────────────────────────────────────────

    if (m_norm === 'newauthorities') {
        return { authority_set: get(0, 'authority_set') };
    }

    // ── transaction-payment events ────────────────────────────────────────────

    if (m_norm === 'transactionfeepaid') {
        return {
            who: get(0, 'who'),
            actual_fee: get(1, 'actual_fee'),
            tip: get(2, 'tip'),
        };
    }

    return data;
}
