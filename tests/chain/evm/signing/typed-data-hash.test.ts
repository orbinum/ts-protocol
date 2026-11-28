/**
 * EIP-712 against the specification's own example (`Mail`), whose type hash,
 * domain separator, struct hash and digest the EIP publishes.
 */
import { describe, expect, it } from 'vitest';
import { toHex } from '../../../../src/foundation/encoding/hex';
import type { TypedData } from '../../../../src/chain/evm/signing/typed-data';
import { typedDataHash } from '../../../../src/chain/evm/signing/typed-data-hash';
import { typedDataStructHash } from '../../../../src/chain/evm/signing/typed-data-struct-hash';
import {
    encodeTypedDataType,
    typedDataTypeHash,
} from '../../../../src/chain/evm/signing/typed-data-type-hash';

const MAIL: TypedData = {
    types: {
        EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
        ],
        Person: [
            { name: 'name', type: 'string' },
            { name: 'wallet', type: 'address' },
        ],
        Mail: [
            { name: 'from', type: 'Person' },
            { name: 'to', type: 'Person' },
            { name: 'contents', type: 'string' },
        ],
    },
    primaryType: 'Mail',
    domain: {
        name: 'Ether Mail',
        version: '1',
        chainId: 1,
        verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
    },
    message: {
        from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
        to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
        contents: 'Hello, Bob!',
    },
};

describe('EIP-712', () => {
    it('encodes the type with its referenced structs', () => {
        expect(encodeTypedDataType('Mail', MAIL.types)).toBe(
            'Mail(Person from,Person to,string contents)Person(string name,address wallet)'
        );
        expect(toHex(typedDataTypeHash('Mail', MAIL.types))).toBe(
            '0xa0cedeb2dc280ba39b857546d74f5549c3a1d7bdc2dd96bf881f76108e23dac2'
        );
    });

    it('hashes the domain and the message as the EIP does', () => {
        expect(toHex(typedDataStructHash('EIP712Domain', MAIL.domain, MAIL.types, 'domain'))).toBe(
            '0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f'
        );
        expect(toHex(typedDataStructHash('Mail', MAIL.message, MAIL.types, 'message'))).toBe(
            '0xc52c0ee5d84264471806290a3f2c4cecfc5490626bf912d01f240d7a274b371e'
        );
    });

    it('gives the published digest', () => {
        expect(toHex(typedDataHash(MAIL))).toBe(
            '0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2'
        );
    });

    it('derives EIP712Domain from the domain when the dapp leaves it out', () => {
        const { EIP712Domain: _omitted, ...types } = MAIL.types;
        expect(toHex(typedDataHash({ ...MAIL, types }))).toBe(toHex(typedDataHash(MAIL)));
    });

    it('accepts integers as numbers, decimal or hex strings — to one digest', () => {
        const asHex = typedDataHash({ ...MAIL, domain: { ...MAIL.domain, chainId: '0x1' } });
        const asDecimal = typedDataHash({ ...MAIL, domain: { ...MAIL.domain, chainId: '1' } });
        expect(toHex(asHex)).toBe(toHex(typedDataHash(MAIL)));
        expect(toHex(asDecimal)).toBe(toHex(typedDataHash(MAIL)));
    });

    it('refuses a malformed member, naming it', () => {
        const bad = { ...MAIL, message: { ...MAIL.message, to: { name: 'Bob', wallet: '0x12' } } };
        expect(() => typedDataHash(bad)).toThrow('typedData.message.to.wallet');
        expect(() => typedDataHash({ ...MAIL, primaryType: 'Nope' })).toThrow('Nope');
    });

    it('hashes arrays and fixed bytes', () => {
        const types = {
            Batch: [
                { name: 'ids', type: 'uint8[]' },
                { name: 'tag', type: 'bytes4' },
                { name: 'delta', type: 'int16' },
            ],
        };
        const data: TypedData = {
            types,
            primaryType: 'Batch',
            domain: { name: 'x' },
            message: { ids: [1, 2, 3], tag: '0xdeadbeef', delta: -2 },
        };
        expect(typedDataHash(data)).toHaveLength(32);
        expect(() =>
            typedDataHash({ ...data, message: { ...data.message, delta: 40000 } })
        ).toThrow('does not fit int16');
        expect(() =>
            typedDataHash({ ...data, message: { ...data.message, tag: '0xdead' } })
        ).toThrow('bytes4');
    });
});
