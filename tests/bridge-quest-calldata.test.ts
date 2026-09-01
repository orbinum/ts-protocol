/**
 * The seam between the SDK and the quest verifier.
 *
 * `buildUnshieldCalldata` writes the withdrawal's recipient; the api-worker
 * reads it back out of the on-chain transaction to decide whether a "Bridge to
 * Substrate" claim qualifies. Neither repo's tests cover the other, so a change
 * to the argument order here would break that quest silently — the claim would
 * simply stop matching, with no failing test anywhere.
 *
 * This pins the contract from the SDK side: recipient is the SIXTH argument, so
 * the sixth 32-byte head word, whatever the dynamic arguments do.
 */
import { describe, it, expect } from 'vitest';
import { buildUnshieldCalldata } from '../src/chain/evm/precompiles/shieldedPoolCalldata';

// A real sr25519 account (not an EVM mirror), as the AccountId32 hex the builder
// takes — `unshieldNote` converts the SS58 with addressToAccountIdHex first.
const RECIPIENT_HEX = '5663009f145cad88132928b189920defdb25ccfe4b2ae15eecc434af861f241e';
const RECIPIENT = `0x${RECIPIENT_HEX}`;

/** The api-worker's reader, verbatim (quest-onchain-verify.ts). */
function unshieldRecipientFromCalldata(inputData: string): string | null {
    const data = inputData.slice(10); // drop '0x' + the 4-byte selector
    const word = data.slice(5 * 64, 6 * 64);
    return /^[0-9a-fA-F]{64}$/.test(word) ? `0x${word.toLowerCase()}` : null;
}

const calldataWith = (proofLen: number, recipientAddress = RECIPIENT) =>
    buildUnshieldCalldata({
        proof: new Uint8Array(proofLen).fill(7),
        merkleRoot: '0x' + '11'.repeat(32),
        nullifier: '0x' + '22'.repeat(32),
        assetId: 0,
        amount: 2_000_000_000_000_000_000n,
        recipientAddress,
        fee: 0n,
        changeCommitment: '0x' + '00'.repeat(32),
        changeEncryptedMemo: new Uint8Array(proofLen),
        circuitVersion: 2,
    });

describe('unshield calldata — the Bridge quest contract', () => {
    it('puts the recipient where the quest verifier reads it', () => {
        expect(unshieldRecipientFromCalldata(calldataWith(256))).toBe(`0x${RECIPIENT_HEX}`);
    });

    it('keeps the recipient at a fixed offset whatever the proof size', () => {
        // `proof` and `changeEncryptedMemo` are dynamic: ABI encoding puts an
        // OFFSET in the head and the payload in the tail, so every head slot
        // stays one word wide. A reader that walked the tail would drift here.
        for (const len of [8, 256, 1024, 4096]) {
            expect(unshieldRecipientFromCalldata(calldataWith(len))).toBe(`0x${RECIPIENT_HEX}`);
        }
    });

    it('encodes an EVM address as a mirror account the verifier can tell apart', () => {
        // The quest turns on this distinction: a mirror is an H160 followed by
        // twelve zero bytes, a real sr25519 account is not.
        const evm = '0xf24ff3a9cf04c71dbc94d0b566f7a27b94566cac';
        const read = unshieldRecipientFromCalldata(calldataWith(256, evm));
        expect(read).toBe(`${evm}${'0'.repeat(24)}`);
        expect(/^0x[0-9a-f]{40}0{24}$/.test(read!)).toBe(true);
        // …and the real account must NOT look like one.
        expect(/^0x[0-9a-f]{40}0{24}$/.test(`0x${RECIPIENT_HEX}`)).toBe(false);
    });
});
