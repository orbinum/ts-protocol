import { describe, expect, it } from 'vitest';
import { toHex } from '../../../../src/foundation/encoding/hex';
import { personalMessageHash } from '../../../../src/chain/evm/signing/personal-message-hash';

describe('personalMessageHash (EIP-191)', () => {
    it('matches the reference hash of "Hello World"', () => {
        // ethers' `hashMessage("Hello World")`.
        expect(toHex(personalMessageHash('Hello World'))).toBe(
            '0xa1de988600a42c4b4ab089b619297c17d53cffae5d5120d82d8a92d0bb3b78f2'
        );
    });

    it('hashes bytes as given and a string as UTF-8, to the same digest', () => {
        expect(toHex(personalMessageHash(new TextEncoder().encode('Hello World')))).toBe(
            toHex(personalMessageHash('Hello World'))
        );
    });
});
