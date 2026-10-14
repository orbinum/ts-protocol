import { describe, it, expect, vi, afterEach } from 'vitest';

/** Browsers and web workers have no `Buffer`: the ISMP module must not reach for it. */
describe('ISMP keys without Node Buffer', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('loads and derives keys and commitments with Buffer undefined', async () => {
        vi.stubGlobal('Buffer', undefined);
        vi.resetModules();
        const ismp = await import('../../src/chain/pallet/ismp/IsmpModule');
        const { requestCommitment } = await import('../../src/chain/pallet/ismp/commitment');

        expect(ismp.ISMP_CHILD_TRIE).toBe(
            '0x3a6368696c645f73746f726167653a64656661756c743a49534d507632'
        );
        const c = `0x${'ab'.repeat(32)}`;
        expect(ismp.commitmentKey(c)).toBe(
            `0x52657175657374436f6d6d69746d656e7473${'ab'.repeat(32)}`
        );
        expect(ismp.receiptKey(c)).toBe(`0x526571756573745265636569707473${'ab'.repeat(32)}`);
        expect(
            requestCommitment({
                Post: {
                    source: 'SUBSTRATE-orbi',
                    dest: 'KUSAMA-4009',
                    nonce: 4n,
                    from: '0x6f72622f6d736773',
                    to: '0x64656d6f2f6d6f64',
                    timeoutTimestamp: 0n,
                    body: '0x01020304',
                },
            })
        ).toBe('0xe51e536288e74f85fb16bc89fe4d43feb49c15049776de908bb402310bd389bc');
    });
});
