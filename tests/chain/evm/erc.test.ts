/** Token standards: topics pinned to their published values, and transfer logs decoded. */
import { describe, expect, it } from 'vitest';
import {
    ERC_EVENT_TOPICS,
    decodeAbiString,
    decodeAbiUint,
    decodeTokenTransfers,
    encodeAbiAddress,
    ercEventName,
} from '../../../src/chain/evm/erc';

const pad = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0');
const A = '0x' + '11'.repeat(20);
const B = '0x' + '22'.repeat(20);
const TOKEN = '0x' + 'AB'.repeat(20);

describe('ERC event topics', () => {
    it('match the published keccak256 of each signature', () => {
        expect(ERC_EVENT_TOPICS.Transfer).toBe(
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        );
        expect(ERC_EVENT_TOPICS.TransferSingle).toBe(
            '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62'
        );
        expect(ERC_EVENT_TOPICS.TransferBatch).toBe(
            '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb'
        );
        expect(ERC_EVENT_TOPICS.Approval).toBe(
            '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'
        );
        expect(ercEventName(ERC_EVENT_TOPICS.Deposit.toUpperCase().replace('0X', '0x'))).toBe(
            'Deposit'
        );
    });
});

describe('decodeTokenTransfers', () => {
    const topics = (t0: string, ...rest: string[]) => [t0, ...rest.map((x) => '0x' + pad(x))];

    it('ERC-20: amount in data; ERC-721: token id in topic 3', () => {
        expect(
            decodeTokenTransfers({
                address: TOKEN,
                topics: topics(ERC_EVENT_TOPICS.Transfer, A, B),
                data: '0x' + pad('0x64'),
            })
        ).toEqual([
            {
                token: TOKEN.toLowerCase(),
                standard: 'erc20',
                from: A,
                to: B,
                amount: 100n,
                tokenId: null,
            },
        ]);
        expect(
            decodeTokenTransfers({
                address: TOKEN,
                topics: topics(ERC_EVENT_TOPICS.Transfer, A, B, '0x07'),
                data: '0x',
            })[0]
        ).toMatchObject({ standard: 'erc721', amount: 1n, tokenId: 7n });
    });

    it('ERC-1155: single, and a batch expanded per id', () => {
        const op = '0x' + '33'.repeat(20);
        expect(
            decodeTokenTransfers({
                address: TOKEN,
                topics: topics(ERC_EVENT_TOPICS.TransferSingle, op, A, B),
                data: '0x' + pad('0x05') + pad('0x09'),
            })
        ).toEqual([
            {
                token: TOKEN.toLowerCase(),
                standard: 'erc1155',
                from: A,
                to: B,
                amount: 9n,
                tokenId: 5n,
            },
        ]);
        // ids at word 2, values at word 5: [offset ids, offset values, len, id, id, len, v, v]
        const data =
            '0x' +
            [
                pad('0x40'),
                pad('0xa0'),
                pad('0x02'),
                pad('0x01'),
                pad('0x02'),
                pad('0x02'),
                pad('0x0a'),
                pad('0x14'),
            ].join('');
        const batch = decodeTokenTransfers({
            address: TOKEN,
            topics: topics(ERC_EVENT_TOPICS.TransferBatch, op, A, B),
            data,
        });
        expect(batch.map((t) => [t.tokenId, t.amount])).toEqual([
            [1n, 10n],
            [2n, 20n],
        ]);
    });

    it('is empty for any other log', () => {
        expect(
            decodeTokenTransfers({
                address: TOKEN,
                topics: [ERC_EVENT_TOPICS.Approval],
                data: '0x',
            })
        ).toEqual([]);
        // An ERC-20 Transfer with no data word reads as a zero amount: the log is recorded.
        expect(
            decodeTokenTransfers({
                address: TOKEN,
                topics: topics(ERC_EVENT_TOPICS.Transfer, A, B),
                data: '0x',
            })[0]?.amount
        ).toBe(0n);
    });
});

describe('ABI words', () => {
    it('decodes strings and uints, and encodes an address word', () => {
        const name = Buffer.from('Orb').toString('hex').padEnd(64, '0');
        expect(decodeAbiString('0x' + pad('0x20') + pad('0x03') + name)).toBe('Orb');
        expect(decodeAbiUint('0x' + pad('0x2a'))).toBe(42n);
        expect(decodeAbiUint('nothex')).toBe(0n);
        expect(encodeAbiAddress(A)).toBe(pad(A));
    });
});
