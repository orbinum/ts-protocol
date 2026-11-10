/**
 * The summary must render what the runtime renders, or the signature is a `BadProof`:
 * unit cases per call, then the runtime's own vectors byte for byte.
 */
import { describe, it, expect } from 'vitest';
import { concatBytes } from '@noble/hashes/utils.js';
import { compactBn, u128, u32 } from '@polkadot-api/substrate-bindings';
import { fromHex, toHex } from '../../../../src/foundation/encoding/hex';
import { textMessage } from '../../../../src/chain/substrate/ed25519Text/message';
import {
    formatOrb,
    formatPercent,
    isTextSignable,
    summaryLines,
    textExpiry,
    textHashFingerprint,
} from '../../../../src/chain/substrate/ed25519Text/summary';
import { VECTORS, nameOf } from './fixtures';

const ORB = 10n ** 18n;
const BOB = fromHex('0x' + 'b0'.repeat(32));

const transfer = (index: number, value: bigint) =>
    concatBytes(Uint8Array.of(0x04, index), BOB, compactBn.enc(value));
const shieldedPool = (index: number, asset: number, amount: bigint, rest = new Uint8Array()) =>
    concatBytes(Uint8Array.of(0x0d, index), u32.enc(asset), u128.enc(amount), rest);
const staking = (index: number, ...args: Uint8Array[]) =>
    concatBytes(Uint8Array.of(0x16, index), ...args);
const pools = (index: number, ...args: Uint8Array[]) =>
    concatBytes(Uint8Array.of(0x1c, index), ...args);
const IMMORTAL = Uint8Array.of(0);
const summary = (call: Uint8Array, tip = 0n, era = IMMORTAL, nonce = 0n) =>
    summaryLines(call, nameOf(call), tip, era, nonce);
const NEVER = '\nexpires: never\nnonce: 0';

describe('formatOrb', () => {
    it.each([
        [0n, '0 ORB'],
        [1n, '0.000000000000000001 ORB'],
        [ORB / 100n, '0.01 ORB'],
        [(3n * ORB) / 2n, '1.5 ORB'],
        [2n * ORB, '2 ORB'],
        [ORB + 1n, '1.000000000000000001 ORB'],
        [2n ** 128n - 1n, '340282366920938463463.374607431768211455 ORB'],
    ])('%s planck is %s', (amount, text) => {
        expect(formatOrb(amount)).toBe(text);
    });
});

describe('formatPercent', () => {
    it.each([
        [0, '0%'],
        [1, '0.0000001%'],
        [125_000_000, '12.5%'],
        [200_000_000, '20%'],
        [1_000_000_000, '100%'],
    ])('%s parts is %s', (parts, text) => {
        expect(formatPercent(parts)).toBe(text);
    });
});

describe('summaryLines', () => {
    it('shows a transfer’s recipient and amount', () => {
        expect(summary(transfer(3, (3n * ORB) / 2n))).toBe(
            `Balances.transfer_keep_alive\nto: ${toHex(BOB)}\namount: 1.5 ORB${NEVER}`
        );
        expect(summary(transfer(0, 1n))).toBe(
            `Balances.transfer_allow_death\nto: ${toHex(BOB)}\namount: 0.000000000000000001 ORB${NEVER}`
        );
    });

    it('shows all and keep alive for transfer_all', () => {
        const call = (keepAlive: number) =>
            concatBytes(Uint8Array.of(0x04, 0x04), BOB, Uint8Array.of(keepAlive));
        expect(summary(call(0))).toBe(
            `Balances.transfer_all\nto: ${toHex(BOB)}\namount: all\nkeep alive: no${NEVER}`
        );
        expect(summary(call(1))).toContain('\nkeep alive: yes\n');
    });

    it('shows a shield’s amount and the fingerprints of its commitment and memo', () => {
        const commitment = new Uint8Array(32).map((_, i) => i);
        const memo = new Uint8Array(180).fill(0x7e);
        const proof = new Uint8Array(300).fill(0x9f);
        const rest = concatBytes(commitment, compactBn.enc(180n), memo, compactBn.enc(300n), proof);
        expect(summary(shieldedPool(0x00, 0, 2n * ORB, rest))).toBe(
            `ShieldedPool.shield\namount: 2 ORB\ncommitment: 0x0001020304050607…18191a1b1c1d1e1f\nmemo: ${textHashFingerprint(memo)}${NEVER}`
        );
        expect(textHashFingerprint(memo)).toMatch(/^0x[0-9a-f]{16}…[0-9a-f]{16}$/);
    });

    it('shows the amount of ORB fee claims, and nothing for other assets', () => {
        expect(summary(shieldedPool(0x13, 0, ORB / 4n))).toBe(
            `ShieldedPool.claim_fees\namount: 0.25 ORB${NEVER}`
        );
        expect(summary(shieldedPool(0x00, 7, 5n))).toBe(`ShieldedPool.shield${NEVER}`);
        expect(summary(shieldedPool(0x13, 7, 5n))).toBe(`ShieldedPool.claim_fees${NEVER}`);
    });

    it('shows a remark’s length and fingerprint', () => {
        const body = new TextEncoder().encode('hello');
        expect(summary(concatBytes(Uint8Array.of(0, 0), compactBn.enc(5n), body))).toBe(
            `System.remark\nlength: 5 bytes\nremark: ${textHashFingerprint(body)}${NEVER}`
        );
    });

    it('shows what a bond stakes and where its rewards go', () => {
        // A 4-byte compact: the payee starts after it, not at a fixed offset.
        const value = compactBn.enc(10n * ORB);
        expect(summary(staking(0x00, value, Uint8Array.of(0)))).toBe(
            `Staking.bond\namount: 10 ORB\nrewards to: staked${NEVER}`
        );
        expect(summary(staking(0x00, value, Uint8Array.of(3), BOB))).toBe(
            `Staking.bond\namount: 10 ORB\nrewards to: ${toHex(BOB)}${NEVER}`
        );
        expect(summary(staking(0x00, compactBn.enc(1n), Uint8Array.of(4)))).toMatch(
            /rewards to: none\nexpires: never\nnonce: 0$/
        );
        expect(summary(staking(0x02, compactBn.enc(ORB)))).toBe(
            `Staking.unbond\namount: 1 ORB${NEVER}`
        );
        expect(summary(staking(0x07, Uint8Array.of(1)))).toBe(
            `Staking.set_payee\nrewards to: stash${NEVER}`
        );
    });

    it('shows every nomination, the validator prefs and a payout with its page', () => {
        const other = fromHex('0x' + 'a1'.repeat(32));
        expect(summary(staking(0x05, compactBn.enc(2n), BOB, other))).toBe(
            `Staking.nominate\nvalidator: ${toHex(BOB)}\nvalidator: ${toHex(other)}${NEVER}`
        );
        expect(summary(staking(0x04, compactBn.enc(125_000_000n), Uint8Array.of(0)))).toBe(
            `Staking.validate\ncommission: 12.5%${NEVER}`
        );
        expect(summary(staking(0x04, compactBn.enc(0n), Uint8Array.of(1)))).toBe(
            `Staking.validate\ncommission: 0%\nblocked: yes${NEVER}`
        );
        expect(summary(staking(0x12, BOB, u32.enc(42)))).toBe(
            `Staking.payout_stakers\nvalidator: ${toHex(BOB)}\nera: 42${NEVER}`
        );
        expect(summary(staking(0x1a, BOB, u32.enc(42), u32.enc(3)))).toBe(
            `Staking.payout_stakers_by_page\nvalidator: ${toHex(BOB)}\nera: 42\npage: 3${NEVER}`
        );
    });

    it('shows what pool members and operators bond, claim and nominate', () => {
        const value = compactBn.enc(5n * ORB);
        expect(summary(pools(0x00, value, u32.enc(7)))).toBe(
            `NominationPools.join\npool: 7\namount: 5 ORB${NEVER}`
        );
        expect(summary(pools(0x01, Uint8Array.of(1)))).toBe(
            `NominationPools.bond_extra\namount: rewards${NEVER}`
        );
        expect(summary(pools(0x0e, BOB, Uint8Array.of(0), u128.enc(ORB)))).toBe(
            `NominationPools.bond_extra_other\nmember: ${toHex(BOB)}\namount: 1 ORB${NEVER}`
        );
        expect(summary(pools(0x03, BOB, compactBn.enc(ORB / 2n)))).toBe(
            `NominationPools.unbond\nmember: ${toHex(BOB)}\npoints: 0.5${NEVER}`
        );
        expect(summary(pools(0x06, value, BOB, BOB, BOB))).toBe(
            `NominationPools.create\namount: 5 ORB\nroot: ${toHex(BOB)}\nnominator: ${toHex(BOB)}\nbouncer: ${toHex(BOB)}${NEVER}`
        );
        expect(summary(pools(0x08, u32.enc(7), compactBn.enc(1n), BOB))).toBe(
            `NominationPools.nominate\npool: 7\nvalidator: ${toHex(BOB)}${NEVER}`
        );
        expect(summary(pools(0x09, u32.enc(7), Uint8Array.of(1)))).toBe(
            `NominationPools.set_state\npool: 7\nstate: blocked${NEVER}`
        );
        expect(summary(pools(0x0f, Uint8Array.of(3)))).toBe(
            `NominationPools.set_claim_permission\npermission: permissionless all${NEVER}`
        );
    });

    it('shows every parameter of a pool’s commission calls', () => {
        const other = fromHex('0x' + 'a1'.repeat(32));
        const pool = u32.enc(7);
        const cases: [Uint8Array, string][] = [
            [
                pools(0x11, pool, Uint8Array.of(1), u32.enc(125_000_000), BOB),
                `NominationPools.set_commission\npool: 7\ncommission: 12.5%\npayee: ${toHex(BOB)}`,
            ],
            [
                pools(0x11, pool, Uint8Array.of(1), u32.enc(0), other),
                `NominationPools.set_commission\npool: 7\ncommission: 0%\npayee: ${toHex(other)}`,
            ],
            [
                pools(0x11, pool, Uint8Array.of(0)),
                'NominationPools.set_commission\npool: 7\ncommission: none',
            ],
            [
                pools(0x12, pool, u32.enc(200_000_000)),
                'NominationPools.set_commission_max\npool: 7\nmax commission: 20%',
            ],
            [
                pools(0x13, pool, u32.enc(5_000_000), u32.enc(600)),
                'NominationPools.set_commission_change_rate\npool: 7\nmax increase: 0.5%\nmin delay: 600 blocks',
            ],
            [pools(0x14, pool), 'NominationPools.claim_commission\npool: 7'],
            [
                pools(0x16, pool, Uint8Array.of(1, 0)),
                'NominationPools.set_commission_claim_permission\npool: 7\npermission: permissionless',
            ],
            [
                pools(0x16, pool, Uint8Array.of(1, 1), BOB),
                `NominationPools.set_commission_claim_permission\npool: 7\npermission: ${toHex(BOB)}`,
            ],
            [
                pools(0x16, pool, Uint8Array.of(0)),
                'NominationPools.set_commission_claim_permission\npool: 7\npermission: root only',
            ],
        ];
        for (const [call, text] of cases) {
            expect(isTextSignable(call, nameOf(call))).toBe(true);
            expect(summary(call)).toBe(`${text}${NEVER}`);
        }
    });

    it('refuses commission calls whose bytes the runtime would not decode', () => {
        const pool = u32.enc(7);
        const refused = [
            pools(0x11, pool),
            pools(0x11, pool, Uint8Array.of(2)),
            pools(0x11, pool, Uint8Array.of(1), u32.enc(1_000_000_001), BOB),
            pools(0x11, pool, Uint8Array.of(1), u32.enc(1)),
            pools(0x11, pool, Uint8Array.of(0, 0)),
            pools(0x12, pool, u32.enc(1_000_000_001)),
            pools(0x12, pool),
            pools(0x13, pool, u32.enc(1_000_000_001), u32.enc(1)),
            pools(0x13, pool, u32.enc(1)),
            pools(0x14, Uint8Array.of(7)),
            pools(0x14, pool, Uint8Array.of(0)),
            pools(0x16, pool, Uint8Array.of(1, 2)),
            pools(0x16, pool, Uint8Array.of(1, 1)),
            pools(0x16, pool, Uint8Array.of(2)),
        ];
        for (const call of refused) {
            expect(isTextSignable(call, nameOf(call)), toHex(call)).toBe(false);
        }
        expect(formatPercent(1_000_000_000)).toBe('100%');
    });

    it('refuses pool calls it cannot show in full', () => {
        const metadata = pools(0x0a, u32.enc(7), compactBn.enc(2n), Uint8Array.of(1, 2));
        expect(isTextSignable(metadata, nameOf(metadata))).toBe(false);
        const roles = pools(0x0c, u32.enc(7), Uint8Array.of(1), BOB, Uint8Array.of(0, 0));
        expect(isTextSignable(roles, nameOf(roles))).toBe(false);
        const tooMany = pools(0x08, u32.enc(7), compactBn.enc(17n), new Uint8Array(17 * 32));
        expect(isTextSignable(tooMany, nameOf(tooMany))).toBe(false);
    });

    it('shows other calls by name and expiry only', () => {
        const burn = concatBytes(Uint8Array.of(0x04, 0x0a), compactBn.enc(1n), Uint8Array.of(0));
        expect(summary(burn)).toBe(`Balances.burn${NEVER}`);
    });

    it('shows a mortal era’s period, and neither expiry, nonce nor tip for bytes that are no era', () => {
        // Period 64 (`log2 - 1` = 5), phase 10: `10 << 4 | 5`.
        expect(textExpiry(Uint8Array.of(0xa5, 0x00))).toBe('within 64 blocks');
        expect(summary(transfer(3, ORB), ORB, Uint8Array.of(0xa5, 0x00))).toMatch(
            /\nexpires: within 64 blocks\nnonce: 0\ntip: 1 ORB$/
        );
        // Period 4, phase 7: the phase is not below the period.
        expect(textExpiry(Uint8Array.of(0x71, 0x00))).toBeNull();
        expect(summary(transfer(3, ORB), ORB, Uint8Array.of(0x71, 0x00))).toMatch(/amount: 1 ORB$/);
    });

    it('adds the tip after the expiry, only when it is not zero', () => {
        expect(summary(transfer(3, ORB), ORB / 100n)).toMatch(
            /\namount: 1 ORB\nexpires: never\nnonce: 0\ntip: 0\.01 ORB$/
        );
        expect(summary(transfer(3, ORB), 0n)).not.toContain('tip:');
    });

    it('shows the nonce after the expiry, mortal or not', () => {
        expect(summary(transfer(3, ORB), ORB, Uint8Array.of(0xa5, 0x00), 7n)).toMatch(
            /\nexpires: within 64 blocks\nnonce: 7\ntip: 1 ORB$/
        );
        expect(summary(transfer(3, ORB), 0n, IMMORTAL, 4_294_967_295n)).toMatch(
            /\nexpires: never\nnonce: 4294967295$/
        );
    });

    it('shows unknown for bytes the metadata does not name', () => {
        expect(summaryLines(Uint8Array.of(0xff, 0xff), null, 5n, IMMORTAL, 3n)).toBe('unknown');
    });
});

describe('the runtime vectors', () => {
    it.each(VECTORS.vectors)('$name renders the runtime text', (v) => {
        const call = fromHex(v.call);
        const text = textMessage(
            fromHex(v.payload),
            fromHex(VECTORS.genesis),
            summaryLines(call, nameOf(call), BigInt(v.tip), fromHex(v.era), BigInt(v.nonce))
        );
        expect(new TextDecoder().decode(text)).toBe(v.text);
    });

    it.each(VECTORS.vectors)('$name is text-signable exactly when the runtime says so', (v) => {
        const call = fromHex(v.call);
        expect(isTextSignable(call, nameOf(call))).toBe(v.signable);
    });

    it('include calls that are not text-signable', () => {
        const refused = VECTORS.vectors.filter((v) => !v.signable).map((v) => v.name);
        expect(refused).toEqual(
            expect.arrayContaining([
                'balances_burn',
                'staking_nominate_too_many',
                'claim_fees_other_asset',
                'pools_set_metadata',
            ])
        );
    });

    it('include a nonce other than zero', () => {
        expect(
            VECTORS.vectors.some((v) => v.nonce > 0 && v.text.includes(`\nnonce: ${v.nonce}\n`))
        ).toBe(true);
    });

    it('include a shield and a payload over 256 bytes', () => {
        const shield = VECTORS.vectors.find((v) => v.name === 'shield');
        expect(fromHex(shield?.payload ?? '0x').length).toBeGreaterThan(256);
        expect(VECTORS.vectors.map((v) => v.name)).toContain('remark_over_256_bytes');
    });
});
