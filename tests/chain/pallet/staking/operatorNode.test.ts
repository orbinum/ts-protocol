import { afterEach, describe, it, expect, vi } from 'vitest';
import { OperatorNode, isLoopbackNodeUrl } from '../../../../src/chain/pallet/staking/operatorNode';
import { SubstrateClient } from '../../../../src/chain/substrate/SubstrateClient';

const GENESIS = '0x' + '58'.repeat(32);
const ALICE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const ALICE_HEX = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';

function nodeAnswering(answers: Record<string, unknown>) {
    const node = {
        request: vi.fn(async (method: string) => answers[method]),
        destroy: vi.fn(),
    };
    vi.spyOn(SubstrateClient, 'connect').mockResolvedValue(node as unknown as SubstrateClient);
    return node;
}

afterEach(() => vi.restoreAllMocks());

describe('OperatorNode', () => {
    it('refuses a node of another chain and closes it', async () => {
        const node = nodeAnswering({ chain_getBlockHash: '0x' + '00'.repeat(32) });
        await expect(OperatorNode.connect('ws://127.0.0.1:9944', GENESIS)).rejects.toThrow(
            /another chain/
        );
        expect(node.destroy).toHaveBeenCalled();
    });

    it('rotates keys with the stash as owner and returns keys and proof', async () => {
        const keys = '0x' + 'ab'.repeat(64);
        const node = nodeAnswering({
            chain_getBlockHash: GENESIS,
            author_rotateKeysWithOwner: { keys, proof: '0x' + 'cd'.repeat(128) },
            author_hasSessionKeys: true,
        });
        const operator = await OperatorNode.connect(
            'ws://127.0.0.1:9944',
            GENESIS.toUpperCase().replace('0X', '0x')
        );
        expect(await operator.rotateKeysWithOwner(ALICE)).toEqual({
            keys,
            proof: '0x' + 'cd'.repeat(128),
        });
        expect(node.request).toHaveBeenCalledWith('author_rotateKeysWithOwner', [ALICE_HEX]);
        expect(await operator.hasSessionKeys(keys)).toBe(true);
        expect(node.request.mock.calls.map(([m]) => m)).not.toContain('author_insertKey');
    });

    it('fails when the node gives no ownership proof', async () => {
        nodeAnswering({
            chain_getBlockHash: GENESIS,
            author_rotateKeysWithOwner: { keys: '0x' + 'ab'.repeat(64) },
        });
        const operator = await OperatorNode.connect('ws://127.0.0.1:9944', GENESIS);
        await expect(operator.rotateKeysWithOwner(ALICE)).rejects.toThrow(/no ownership proof/);
    });
});

describe('isLoopbackNodeUrl', () => {
    it.each([
        ['ws://127.0.0.1:9944', true],
        ['ws://localhost:9944', true],
        ['wss://[::1]:9944', true],
        ['ws://evil.example:9944', false],
        ['ws://127.0.0.1.evil.example', false],
        ['ws://user:pw@127.0.0.1:9944', false],
        ['http://127.0.0.1:9944', false],
        ['javascript:alert(1)', false],
        ['', false],
    ])('%s → %s', (url, ok) => {
        expect(isLoopbackNodeUrl(url)).toBe(ok);
    });

    it('refuses a remote node before connecting', async () => {
        const connect = vi.spyOn(SubstrateClient, 'connect');
        await expect(OperatorNode.connect('ws://node.example:9944', GENESIS)).rejects.toThrow(
            /localhost/
        );
        expect(connect).not.toHaveBeenCalled();
    });
});
