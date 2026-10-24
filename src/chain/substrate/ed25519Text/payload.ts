/**
 * The signing payload the runtime verifies, rebuilt from the pjs JSON polkadot-api hands a
 * `signPayload`: the call, the extension (era, nonce, tip, metadata-hash mode), then the
 * implicit data (versions, genesis, block, metadata hash). Never its blake2_256.
 */
import { concatBytes as concat } from '@noble/hashes/utils.js';
import { compactBn, u32 } from '@polkadot-api/substrate-bindings';
import type { SignPayload } from 'polkadot-api/pjs-signer';
import { fromHex } from '../../../foundation/encoding/hex';

export type PjsPayload = Parameters<SignPayload>[0];

/**
 * The runtime's `SignedExtra`, by metadata identifier, in order. Any other list means the
 * bytes below are not what the runtime verifies.
 */
export const SIGNED_EXTENSIONS = [
    'CheckNonZeroSender',
    'CheckSpecVersion',
    'CheckTxVersion',
    'CheckGenesis',
    'CheckMortality',
    'CheckNonce',
    'CheckWeight',
    'ChargeTransactionPayment',
    'CheckMetadataHash',
];

export function signingPayload(p: PjsPayload): Uint8Array {
    if (p.signedExtensions.join() !== SIGNED_EXTENSIONS.join()) {
        throw new Error(
            `Unexpected signed extensions [${p.signedExtensions.join(', ')}]: an ed25519 ` +
                'account cannot sign for this runtime.'
        );
    }
    const withHash = p.mode === 1;
    return concat(
        fromHex(p.method),
        fromHex(p.era),
        compactBn.enc(BigInt(p.nonce)),
        compactBn.enc(BigInt(p.tip)),
        Uint8Array.of(withHash ? 1 : 0),
        u32.enc(Number(BigInt(p.specVersion))),
        u32.enc(Number(BigInt(p.transactionVersion))),
        fromHex(p.genesisHash),
        fromHex(p.blockHash),
        withHash ? concat(Uint8Array.of(1), fromHex(p.metadataHash as string)) : Uint8Array.of(0)
    );
}
