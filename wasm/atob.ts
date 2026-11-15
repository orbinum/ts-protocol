/**
 * `atob` for Javy's QuickJS, which has none: `poseidon-lite` decodes its round
 * constants from base64 with it when it loads. Imported first by `main.ts`, so
 * it is in place before any module that needs it evaluates. Node and browsers
 * have their own; this file is only in the WASI module.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function atob(input: string): string {
    const clean = String(input)
        .replace(/[\t\n\f\r ]+/g, '')
        .replace(/={1,2}$/, '');
    if (clean.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(clean)) {
        throw new Error('atob: invalid base64');
    }
    let out = '';
    let bits = 0;
    let buffer = 0;
    for (const char of clean) {
        buffer = (buffer << 6) | ALPHABET.indexOf(char);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out += String.fromCharCode((buffer >> bits) & 0xff);
        }
    }
    return out;
}

/** Installs `atob` when the runtime lacks it. Returns whether it was missing. */
export function installAtob(): boolean {
    const scope = globalThis as { atob?: (input: string) => string };
    if (typeof scope.atob === 'function') return false;
    scope.atob = atob;
    return true;
}

// At load, before any module that imports after this one evaluates.
installAtob();

export { atob };
