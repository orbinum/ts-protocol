/** The text frames the summary between the chain and a hash of the whole payload. */
import { describe, it, expect } from 'vitest';
import { blake2b } from '@noble/hashes/blake2.js';
import { fromHex, toHex } from '../../../../src/foundation/encoding/hex';
import { textMessage, wrapBytes } from '../../../../src/chain/substrate/ed25519Text/message';
import { GENESIS } from './fixtures';

const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const hash = (b: Uint8Array) => toHex(blake2b(b, { dkLen: 32 }));

describe('textMessage', () => {
    it('frames the summary with the chain and the payload hash', () => {
        const payload = new Uint8Array(40).fill(0xff);
        expect(decode(textMessage(payload, fromHex(GENESIS), 'System.remark'))).toBe(
            `Orbinum transaction\nchain: ${GENESIS}\naction: System.remark\npayload: ${hash(payload)}`
        );
    });

    it('hashes the whole payload at any size', () => {
        const payload = new Uint8Array(1000).fill(7);
        const text = decode(textMessage(payload, fromHex(GENESIS), 'X.y'));
        expect(text.endsWith(`\npayload: ${hash(payload)}`)).toBe(true);
    });

    it('keeps a multi-line summary between action and payload', () => {
        const text = decode(textMessage(Uint8Array.of(1), fromHex(GENESIS), 'A.b\namount: 1 ORB'));
        expect(text).toMatch(/\naction: A\.b\namount: 1 ORB\npayload: 0x[0-9a-f]{64}$/);
    });
});

describe('wrapBytes', () => {
    it('wraps a message in <Bytes> tags, as signRaw signs it', () => {
        expect(decode(wrapBytes(new TextEncoder().encode('hi')))).toBe('<Bytes>hi</Bytes>');
    });
});
