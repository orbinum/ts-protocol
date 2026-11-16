/**
 * The token standards as an EVM chain logs and answers them: event topics, getter
 * selectors, ABI words, and the transfers a log records (ERC-20, ERC-721, ERC-1155).
 * Pure: fetching receipts and calling contracts is the host's.
 */
import { Keccak256 } from '@polkadot-api/substrate-bindings';
import { toHex } from '../../foundation/encoding/hex';

const topic = (signature: string) => toHex(Keccak256(new TextEncoder().encode(signature)));

/** topic0 of the token standards' events, derived from their signatures. */
export const ERC_EVENT_TOPICS = {
    Transfer: topic('Transfer(address,address,uint256)'),
    Approval: topic('Approval(address,address,uint256)'),
    ApprovalForAll: topic('ApprovalForAll(address,address,bool)'),
    TransferSingle: topic('TransferSingle(address,address,address,uint256,uint256)'),
    TransferBatch: topic('TransferBatch(address,address,address,uint256[],uint256[])'),
    Deposit: topic('Deposit(address,uint256)'),
    Withdrawal: topic('Withdrawal(address,uint256)'),
} as const;

const EVENT_BY_TOPIC = new Map(Object.entries(ERC_EVENT_TOPICS).map(([name, t]) => [t, name]));

/** The token-standard event a log's first topic names, or null. */
export function ercEventName(topic0: string | null | undefined): string | null {
    return (topic0 && EVENT_BY_TOPIC.get(topic0.toLowerCase())) || null;
}

/** 4-byte selectors (`0x` + 8 hex) of the token getters a reader calls. */
export const ERC_SELECTORS = {
    name: '0x06fdde03',
    symbol: '0x95d89b41',
    decimals: '0x313ce567',
    totalSupply: '0x18160ddd',
    balanceOf: '0x70a08231',
    tokenURI: '0xc87b56dd',
    uri: '0x0e89341c',
    baseURI: '0x6c0360eb',
    supportsInterface: '0x01ffc9a7',
} as const;

/** An ABI-encoded `string` return value; empty on malformed data. */
export function decodeAbiString(hex: string | null | undefined): string {
    if (!hex || hex === '0x') return '';
    const data = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (data.length < 128) return '';
    const length = parseInt(data.slice(64, 128), 16);
    if (!length || Number.isNaN(length)) return '';
    const body = data.slice(128, 128 + length * 2);
    const bytes = new Uint8Array(body.match(/../g)?.map((b) => parseInt(b, 16)) ?? []);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\0/g, '');
}

/** An ABI-encoded `uint256` (hex) as a bigint; 0n on malformed data. */
export function decodeAbiUint(hex: string | null | undefined): bigint {
    if (!hex || hex === '0x') return 0n;
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    try {
        return BigInt(`0x${clean || '0'}`);
    } catch {
        return 0n;
    }
}

/** A uint256 argument as one 32-byte ABI word (64 hex, no `0x`). */
export function encodeAbiUint256(value: bigint): string {
    return value.toString(16).padStart(64, '0');
}

/** An address argument as one 32-byte ABI word (64 hex, no `0x`). */
export function encodeAbiAddress(address: string): string {
    return address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

/** A log as a receipt (or the `evm.Log` event) carries it. */
export interface EvmLogLike {
    address: string;
    topics: readonly string[];
    data: string;
}

/** A token moving between two addresses, as one log records it. */
export interface DecodedTokenTransfer {
    token: string;
    standard: 'erc20' | 'erc721' | 'erc1155';
    from: string;
    to: string;
    /** Units moved: the ERC-20 amount, 1 for an ERC-721 token, the ERC-1155 value. */
    amount: bigint;
    /** The token id (ERC-721, ERC-1155), or null for ERC-20. */
    tokenId: bigint | null;
}

const addressOf = (word: string | undefined) =>
    `0x${(word ?? '').slice(-40).toLowerCase().padStart(40, '0')}`;

function words(data: string): string[] {
    const clean = data.startsWith('0x') ? data.slice(2) : data;
    const out: string[] = [];
    for (let i = 0; i + 64 <= clean.length; i += 64) out.push(clean.slice(i, i + 64));
    return out;
}

const word = (w: string | undefined) => (w === undefined ? null : BigInt(`0x${w}`));

/**
 * The token transfers one log records: one for `Transfer` (ERC-20 with 3 topics,
 * ERC-721 with 4) and `TransferSingle`, one per id for `TransferBatch`. Empty for any
 * other log, or a malformed one.
 */
export function decodeTokenTransfers(log: EvmLogLike): DecodedTokenTransfer[] {
    const token = log.address.toLowerCase();
    const [t0, t1, t2, t3] = log.topics.map((t) => t.toLowerCase());
    try {
        if (t0 === ERC_EVENT_TOPICS.Transfer && log.topics.length === 3) {
            const amount = decodeAbiUint(log.data);
            return [
                {
                    token,
                    standard: 'erc20',
                    from: addressOf(t1),
                    to: addressOf(t2),
                    amount,
                    tokenId: null,
                },
            ];
        }
        if (t0 === ERC_EVENT_TOPICS.Transfer && log.topics.length === 4) {
            return [
                {
                    token,
                    standard: 'erc721',
                    from: addressOf(t1),
                    to: addressOf(t2),
                    amount: 1n,
                    tokenId: decodeAbiUint(t3),
                },
            ];
        }
        if (log.topics.length !== 4) return [];
        const from = addressOf(t2);
        const to = addressOf(t3);
        const w = words(log.data);
        if (t0 === ERC_EVENT_TOPICS.TransferSingle) {
            const [id, value] = [word(w[0]), word(w[1])];
            if (id === null || value === null) return [];
            return [{ token, standard: 'erc1155', from, to, amount: value, tokenId: id }];
        }
        if (t0 === ERC_EVENT_TOPICS.TransferBatch) {
            if (w.length < 2) return [];
            const ids = Number(BigInt(`0x${w[0]}`)) / 32;
            const values = Number(BigInt(`0x${w[1]}`)) / 32;
            const count = Number(word(w[ids]) ?? -1n);
            if (count < 0 || count !== Number(word(w[values]) ?? -1n)) return [];
            return Array.from({ length: count }, (_, i) => ({
                token,
                standard: 'erc1155' as const,
                from,
                to,
                amount: word(w[values + 1 + i]) ?? 0n,
                tokenId: word(w[ids + 1 + i]) ?? 0n,
            }));
        }
    } catch {
        return [];
    }
    return [];
}
