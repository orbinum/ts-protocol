/**
 * Checking that the platform actually provides WebCrypto, and saying so when
 * it does not.
 *
 * Every environment this SDK targets has `crypto.subtle` — except the one that
 * matters most. React Native's Hermes ships neither `crypto.subtle` nor
 * `crypto.getRandomValues`, so a wallet there needs a polyfill imported before
 * anything else. That is a one-line fix in the app's entry file, and the
 * failure without it does not point anywhere near it:
 *
 *     TypeError: Cannot read properties of undefined (reading 'importKey')
 *
 * Thrown from deep inside a vault operation, that names neither the missing
 * capability nor the file that fixes it. On a device, with no stack pointing
 * at the app's own code, it is a genuinely hard afternoon.
 *
 * These guards run at the top of each entry point that needs WebCrypto and
 * turn it into a sentence a developer can act on. They cost one property read
 * on a path that is about to do key derivation, so the overhead is not
 * measurable.
 *
 * Deliberately NOT an injection seam. Making the crypto provider injectable
 * would mean threading it through every vault call, and the platforms that
 * lack it are precisely the ones where a global polyfill is the established
 * fix. `foundation/crypto/webcrypto.ts` re-exports the *types* for the same
 * audience; this is the runtime half.
 */

/** How a host on each platform gets WebCrypto, named in the error. */
const REMEDY =
    'React Native: install react-native-quick-crypto and import it FIRST in your ' +
    'entry file, before any other import. Node 16/18: set ' +
    "globalThis.crypto = require('node:crypto').webcrypto. " +
    'Browsers, extension service workers and Node >=19 provide it natively.';

/** Raised when the platform lacks a cryptographic primitive this SDK needs. */
export class MissingCryptoError extends Error {
    constructor(what: string) {
        super(`${what} is not available in this environment. ${REMEDY}`);
        this.name = 'MissingCryptoError';
    }
}

/**
 * Asserts `crypto.getRandomValues` exists.
 *
 * Separate from `requireSubtleCrypto` because the two are not always present
 * together: some React Native polyfills provide randomness without SubtleCrypto,
 * and a caller that only needs a blinding factor should not be told to install
 * more than it needs.
 */
export function requireRandomValues(): void {
    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
        throw new MissingCryptoError('crypto.getRandomValues');
    }
}

/** Asserts `crypto.subtle` exists — key derivation, encryption, signing. */
export function requireSubtleCrypto(): void {
    if (typeof crypto === 'undefined' || crypto.subtle === undefined) {
        throw new MissingCryptoError('crypto.subtle (SubtleCrypto)');
    }
}
