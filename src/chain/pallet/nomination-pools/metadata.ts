/**
 * A pool's public profile, kept in its on-chain metadata (`set_metadata`): a name and
 * at most one link, as UTF-8 `name` or `name\nurl`. The chain stores the bytes as they
 * are (`MaxMetadataLen`, 256); this module is the convention clients share to write
 * and read them.
 *
 * The link is set by the pool's root or bouncer, not by Orbinum: only `https` links are
 * written or read back, without credentials, so a client never renders a script, data
 * or plain-http link from it.
 */

/** The most bytes a pool's metadata holds (`MaxMetadataLen`). */
export const POOL_METADATA_MAX_BYTES = 256;

/** The most bytes (and characters: ASCII) of a pool's name. */
export const POOL_NAME_MAX_BYTES = 64;

/** A pool's name and its one link, if any. */
export interface PoolProfile {
    name: string;
    url: string | null;
}

/** Why a profile cannot be written. */
export type PoolProfileRefusal =
    | 'NameInvalid'
    | 'NameTooLong'
    | 'NameRequired'
    | 'UrlInvalid'
    | 'UrlNotHttps'
    | 'UrlHasCredentials'
    | 'TooLong';

const encoder = new TextEncoder();

/** UTF-8 length of `text`. */
export const utf8Length = (text: string): number => encoder.encode(text).length;

/** ASCII letters and digits, in words one space apart, as the runtime takes a name. */
export function isPoolName(name: string): boolean {
    return name.length <= POOL_NAME_MAX_BYTES && /^[A-Za-z0-9]+( [A-Za-z0-9]+)*$/.test(name);
}

/** A plain `https` URL, as the runtime takes a link: see the module comment. */
export function isPoolUrl(url: string): boolean {
    if (!url.startsWith('https://')) return false;
    const rest = url.slice('https://'.length);
    const end = rest.search(/[/?#]/);
    const host = end === -1 ? rest : rest.slice(0, end);
    const tail = end === -1 ? '' : rest.slice(end);
    return (
        host.includes('.') &&
        /^[a-z0-9.-]+$/.test(host) &&
        !/^[.-]|[.-]$/.test(host) &&
        /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/.test(tail)
    );
}

/**
 * Whether a link's host has an internationalized label (`xn--`, punycode). The runtime
 * takes it, but a browser may show it in Unicode, where it can imitate another site's
 * name: a client should say so beside it.
 */
export function isPunycodeUrl(url: string): boolean {
    const host = url.replace(/^https:\/\//, '').split(/[/?#]/, 1)[0] ?? '';
    return host.split('.').some((label) => label.startsWith('xn--'));
}

/** A link as typed, checked and written as the URL standard spells it. */
function checkUrl(input: string): { url: string } | { refusal: PoolProfileRefusal } {
    if (/\s/.test(input)) return { refusal: 'UrlInvalid' };
    let parsed: URL;
    try {
        parsed = new URL(input);
    } catch {
        return { refusal: 'UrlInvalid' };
    }
    if (parsed.protocol !== 'https:') return { refusal: 'UrlNotHttps' };
    if (parsed.username || parsed.password) return { refusal: 'UrlHasCredentials' };
    return isPoolUrl(parsed.href) ? { url: parsed.href } : { refusal: 'UrlInvalid' };
}

/** `input` as the link a profile stores, or null when it is not an acceptable link. */
export function normalizePoolUrl(input: string): string | null {
    const checked = checkUrl(input.trim());
    return 'url' in checked ? checked.url : null;
}

/** Why `profile` cannot be written, or null. An empty profile clears the metadata. */
export function poolProfileRefusal(profile: PoolProfile): PoolProfileRefusal | null {
    const name = profile.name.trim();
    const url = profile.url?.trim() ?? '';
    if (name.length > POOL_NAME_MAX_BYTES) return 'NameTooLong';
    if (name && !isPoolName(name)) return 'NameInvalid';
    if (url) {
        if (!name) return 'NameRequired';
        const checked = checkUrl(url);
        if ('refusal' in checked) return checked.refusal;
    }
    return utf8Length(poolMetadataText(profile)) > POOL_METADATA_MAX_BYTES ? 'TooLong' : null;
}

/** The text a profile is stored as: `name`, or `name\nurl`. */
function poolMetadataText(profile: PoolProfile): string {
    const name = profile.name.trim();
    const url = profile.url?.trim() ? normalizePoolUrl(profile.url) : null;
    return url ? `${name}\n${url}` : name;
}

/** The metadata bytes for `profile`; throws `setMetadata: <refusal>` when it cannot be written. */
export function encodePoolMetadata(profile: PoolProfile): Uint8Array {
    const refusal = poolProfileRefusal(profile);
    if (refusal) throw new Error(`setMetadata: ${refusal}`);
    return encoder.encode(poolMetadataText(profile));
}

/**
 * The profile in metadata bytes exactly as the runtime reads them, or null for metadata
 * it refuses. Empty metadata is an empty name.
 */
export function decodePoolProfile(metadata: Uint8Array): PoolProfile | null {
    let text: string;
    try {
        // Keep a BOM: the runtime's `from_utf8` does, and the name rule refuses it.
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(metadata);
    } catch {
        return null;
    }
    if (text === '') return { name: '', url: null };
    const newline = text.indexOf('\n');
    const name = newline === -1 ? text : text.slice(0, newline);
    const url = newline === -1 ? null : text.slice(newline + 1);
    return isPoolName(name) && (url === null || isPoolUrl(url)) ? { name, url } : null;
}

/**
 * The profile in a pool's metadata, as decoded UTF-8, for display: `decodePoolProfile`'s,
 * or no name and no link for metadata the runtime's rule refuses (set before the rule).
 */
export function parsePoolMetadata(metadata: string): PoolProfile {
    return decodePoolProfile(encoder.encode(metadata)) ?? { name: '', url: null };
}
