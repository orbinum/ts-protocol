import type { HexString } from '../values/hex-string';

/**
 * A signed message, and the SS58 account that made it.
 *
 * The scheme is the account's key's: `eip191` for an account whose key is
 * secp256k1 — every Orbinum Wallet account, where the SS58 account IS the EVM
 * address's (`address ‖ 0x00×12`) — and `sr25519` for one whose key is. An
 * `eip191` signature is `r ‖ s ‖ v` (65 bytes) over `personal_sign`'s hash of
 * `<Bytes>message</Bytes>`; recover it with `recoverEip191` and map the address
 * with `evmToSubstrate` to check it is `signer`.
 */
export interface OrbinumSignature {
    signature: HexString;
    signer: string;
    scheme: 'eip191' | 'sr25519';
}
