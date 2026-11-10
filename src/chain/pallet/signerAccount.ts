import type { SignerTxCreator as SubstrateSigner } from 'polkadot-api/tx-creator';
import { accountIdHexToSs58 } from '../../foundation/address';
import { toHex } from '../../foundation/encoding/hex';

/**
 * The signer's account in SS58, or null when its public key is not an account id (a raw
 * ECDSA key): checks that need the account are then left to the chain.
 */
export function signerAccount(signer: SubstrateSigner): string | null {
    const key = signer.publicKey;
    return key instanceof Uint8Array && key.length === 32 ? accountIdHexToSs58(toHex(key)) : null;
}
