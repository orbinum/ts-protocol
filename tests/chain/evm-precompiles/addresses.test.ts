import { describe, expect, it } from 'vitest';
import { keccakAsU8a } from '@polkadot/util-crypto';
import {
    BALANCES_SEL,
    KNOWN_PRECOMPILES,
    PRECOMPILE_ADDR,
    getPrecompileLabel,
} from '../../../src/chain/evm/precompiles/addresses';

const selectorOf = (signature: string) =>
    keccakAsU8a(new TextEncoder().encode(signature), 256).slice(0, 4);

describe('Balances precompile (0x0802)', () => {
    it('is in the address book and the registry', () => {
        expect(PRECOMPILE_ADDR.BALANCES).toBe('0x0000000000000000000000000000000000000802');
        expect(KNOWN_PRECOMPILES[PRECOMPILE_ADDR.BALANCES]?.name).toBe('Balances');
        expect(getPrecompileLabel(PRECOMPILE_ADDR.BALANCES)).not.toBeNull();
    });

    it('selectors are the keccak of their signatures', () => {
        expect(BALANCES_SEL.TRANSFER).toEqual(selectorOf('transfer(bytes32,uint256)'));
        expect(BALANCES_SEL.TRANSFER_KEEP_ALIVE).toEqual(
            selectorOf('transferKeepAlive(bytes32,uint256)')
        );
    });

    it('registry functions match the selectors', () => {
        const fns = KNOWN_PRECOMPILES[PRECOMPILE_ADDR.BALANCES]!.functions;
        expect(fns['6a467394']).toBe('transfer(bytes32,uint256)');
        expect(fns['ac6ac4c4']).toBe('transferKeepAlive(bytes32,uint256)');
    });
});
