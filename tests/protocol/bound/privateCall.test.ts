import { describe, it, expect } from 'vitest';
import {
    PRIVATE_CALL_EXECUTOR,
    PRIVATE_CALL_EXECUTOR_ACCOUNT_ID,
    PRIVATE_CALL_MAX_GAS,
    PRIVATE_CALL_MAX_INPUT,
    assertBoundAction,
    assertPrivateCallRequest,
    assertPrivateCallTerms,
    boundActionArg,
    boundSpendDigest,
    decodeBoundAction,
    encodeBoundAction,
    privateCallGasLimit,
    privateCallIntrinsicGas,
    privateCallMinFee,
    type BoundAction,
    type PrivateCallRequest,
} from '../../../src/protocol/bound/index';
import { toHex } from '../../../src/foundation/encoding/hex';

const key = (b: number) => new Uint8Array(32).fill(b);
const target = '0x' + 'aa'.repeat(20);

const request = (over: Partial<PrivateCallRequest> = {}): PrivateCallRequest => ({
    deadline: 1_000,
    gasLimit: 21_000n + 32n,
    steps: [{ target, input: Uint8Array.from([0xde, 0xad]), value: 5n }],
    minReturn: 4n,
    ownerPk: key(7),
    blinding: key(8),
    ...over,
});
const action = (over?: Partial<PrivateCallRequest>): BoundAction => ({
    type: 'PrivateCall',
    value: request(over),
});

describe('PrivateCall encoding', () => {
    it('encodes as the runtime does (`the_action_encodes_as_clients_hash_it`)', () => {
        const runtimeVector =
            '0x01' +
            'e8030000' +
            '2852000000000000' +
            '04' +
            'aa'.repeat(20) +
            '08dead' +
            '05000000000000000000000000000000' +
            '04000000000000000000000000000000' +
            '07'.repeat(32) +
            '08'.repeat(32);
        expect(toHex(encodeBoundAction(action()))).toBe(runtimeVector);
    });

    it('reads back the call argument, as PAPI or as JSON', () => {
        const a = action();
        expect(decodeBoundAction(boundActionArg(a))).toEqual(a);
        const json = JSON.parse(
            JSON.stringify(boundActionArg(a), (_k, v) =>
                typeof v === 'bigint' ? `${v}` : v instanceof Uint8Array ? toHex(v) : v
            )
        );
        expect(decodeBoundAction(json)).toEqual(a);
    });

    it('passes the target as hex and the calldata as bytes', () => {
        const arg = boundActionArg(action()) as {
            value: { steps: { target: string; input: unknown }[] };
        };
        expect(arg.value.steps[0]!.target).toBe(target);
        expect(arg.value.steps[0]!.input).toBeInstanceOf(Uint8Array);
    });

    it('binds the call in the digest', () => {
        const genesis = '0x' + '11'.repeat(32);
        const base = boundSpendDigest(genesis, action(), new Uint8Array());
        expect(boundSpendDigest(genesis, action({ minReturn: 5n }), new Uint8Array())).not.toBe(
            base
        );
        expect(boundSpendDigest(genesis, action({ deadline: 1_001 }), new Uint8Array())).not.toBe(
            base
        );
    });
});

describe('the executor', () => {
    it('is H160("orbinum/private-call") and its account adds 12 zero bytes', () => {
        expect(PRIVATE_CALL_EXECUTOR).toBe(toHex(new TextEncoder().encode('orbinum/private-call')));
        expect(PRIVATE_CALL_EXECUTOR_ACCOUNT_ID).toHaveLength(2 + 64);
        expect(PRIVATE_CALL_EXECUTOR_ACCOUNT_ID.endsWith('00'.repeat(12))).toBe(true);
    });
});

describe('gas and fee', () => {
    it('charges 21 000 per step and 4 or 16 per calldata byte, as the runtime', () => {
        const steps = [
            { target, input: new Uint8Array(PRIVATE_CALL_MAX_INPUT).fill(0xff), value: 0n },
            { target, input: new Uint8Array(10), value: 0n },
        ];
        expect(privateCallIntrinsicGas(steps)).toBe(21_000n + 16n * 16_384n + 21_000n + 40n);
    });

    it('is the spend fee and the whole gas limit at the price', () => {
        expect(privateCallMinFee(100n, 7n, 1_000n)).toBe(1_700n);
    });
});

describe('assertPrivateCallRequest', () => {
    it('refuses what the runtime would, before any proof', () => {
        const bad: [Partial<PrivateCallRequest>, RegExp, bigint?][] = [
            [{ steps: [] }, /steps/],
            [{ steps: Array(9).fill(request().steps[0]) }, /steps/],
            [{ steps: [{ target: '0x12', input: new Uint8Array(), value: 0n }] }, /target/],
            [
                {
                    steps: [
                        { target, input: new Uint8Array(PRIVATE_CALL_MAX_INPUT + 1), value: 0n },
                    ],
                },
                /input/,
            ],
            [{ steps: [{ target, input: new Uint8Array(), value: -1n }] }, /value/],
            [{ gasLimit: 20_999n }, /intrinsic/],
            [{ gasLimit: 1n << 64n }, /uint64/],
            [{ deadline: -1 }, /deadline/],
            [{ minReturn: 1n << 128n }, /minReturn/],
            [{}, /more than the spend/, 4n],
        ];
        for (const [over, error, amount] of bad) {
            expect(() => assertPrivateCallRequest(request(over), 'call', amount)).toThrow(error);
        }
        expect(() => assertPrivateCallRequest(request(), 'call', 5n)).not.toThrow();
        expect(() => encodeBoundAction(action({ ownerPk: key(0) }))).toThrow(/ownerPk/);
    });
});

describe('private call gas', () => {
    it('refuses a gas limit above a quarter of a block', () => {
        expect(() =>
            assertPrivateCallRequest(request({ gasLimit: PRIVATE_CALL_MAX_GAS }), 'r')
        ).not.toThrow();
        expect(() =>
            assertPrivateCallRequest(request({ gasLimit: PRIVATE_CALL_MAX_GAS + 1n }), 'r')
        ).toThrow(/most gas/);
    });

    it('counts every step but the last with a quarter more, as the runtime shares the limit', () => {
        expect(privateCallGasLimit([])).toBe(0n);
        expect(privateCallGasLimit([100_000n])).toBe(100_000n);
        expect(privateCallGasLimit([100_000n, 40_000n, 60_000n])).toBe(
            125_000n + 50_000n + 60_000n
        );
    });
});

describe('terms, keys and the action', () => {
    it('checks the terms without the keys, and the request with them', () => {
        const { ownerPk: _ownerPk, blinding: _blinding, ...terms } = request();
        expect(() => assertPrivateCallTerms(terms, 'call', 5n)).not.toThrow();
        expect(() => assertPrivateCallRequest(request({ ownerPk: key(0) }), 'call')).toThrow(
            /call\.ownerPk/
        );
        expect(() =>
            assertPrivateCallRequest(request({ blinding: new Uint8Array(31) }), 'call')
        ).toThrow(/call\.blinding/);
    });

    it('holds a call to its spend amount, and refuses an unknown action', () => {
        expect(() => assertBoundAction(action(), 'a', 5n)).not.toThrow();
        expect(() => assertBoundAction(action(), 'a', 4n)).toThrow(/more than/);
        expect(() => assertBoundAction({ type: 'Nope' } as never, 'a')).toThrow(/unknown action/);
    });
});
