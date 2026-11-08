/**
 * Reference vectors: real notes built the way a private transfer builds them
 * (stealth address, sealed memo, slip), with the answer of the wallet's own
 * `importPaymentSlip` for each. Regenerate them with the wallet, never by hand.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromHex } from '../../../src';
import type { PaymentViewingKey } from '../../../src/protocol/payment';

export interface PaymentVector {
    name: string;
    slip: string;
    expected: null | {
        commitmentHex: string;
        value: string;
        assetId: string;
        leafIndex?: number;
        txHash?: string;
        senderAddress: string | null;
        sourcePk: string;
    };
}

const FILE: {
    recipient: { viewingSecretKey: string; ownerPk: string; viewingPublicKey: string };
    cases: PaymentVector[];
} = JSON.parse(
    readFileSync(join(import.meta.dirname, '../../vectors/payment-verification.json'), 'utf8')
);

export const VECTORS = FILE.cases;
export const KEY: PaymentViewingKey = {
    viewingSecretKey: fromHex(FILE.recipient.viewingSecretKey),
    ownerPk: BigInt(FILE.recipient.ownerPk),
};
/** The recipient's packed viewing public key, to seal slips to them. */
export const RECIPIENT_IVK = fromHex(FILE.recipient.viewingPublicKey);
export const vector = (name: string): PaymentVector => {
    const found = VECTORS.find((v) => v.name === name);
    if (!found) throw new Error(`no vector ${name}`);
    return found;
};
