import { describe, expect, it } from 'vitest';
import {
    POOL_METADATA_MAX_BYTES,
    POOL_NAME_MAX_BYTES,
    decodePoolProfile,
    encodePoolMetadata,
    isPoolName,
    isPoolUrl,
    isPunycodeUrl,
    normalizePoolUrl,
    parsePoolMetadata,
    poolProfileRefusal,
} from '../../../../src/chain/pallet/nomination-pools/metadata';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const bytes = (s: string) => new TextEncoder().encode(s);

describe('pool metadata: a name and one link, all ASCII', () => {
    it('writes `name` alone, or `name\\nurl`; an empty profile clears it', () => {
        expect(text(encodePoolMetadata({ name: ' Orbinum Pool 7 ', url: null }))).toBe(
            'Orbinum Pool 7'
        );
        expect(
            text(encodePoolMetadata({ name: 'Orbinum Pool', url: ' https://x.com/orbinum ' }))
        ).toBe('Orbinum Pool\nhttps://x.com/orbinum');
        // A bare host is written as the URL standard spells it; the host in lowercase.
        expect(text(encodePoolMetadata({ name: 'P', url: 'https://Orbinum.Network' }))).toBe(
            'P\nhttps://orbinum.network/'
        );
        expect(encodePoolMetadata({ name: '', url: null })).toEqual(new Uint8Array());
    });

    it('reads back what it writes', () => {
        const profile = { name: 'Orbinum Pool', url: 'https://x.com/orbinum' };
        const metadata = encodePoolMetadata(profile);
        expect(parsePoolMetadata(text(metadata))).toEqual(profile);
        expect(decodePoolProfile(metadata)).toEqual(profile);
    });
});

describe('isPoolName', () => {
    it('takes ASCII letters and digits in words one space apart, up to 64', () => {
        for (const ok of ['Orbinum', 'Orbinum Pool 7', 'A', 'a'.repeat(POOL_NAME_MAX_BYTES)]) {
            expect(isPoolName(ok)).toBe(true);
        }
        for (const bad of [
            'Orbinum 🌊',
            'Señor Pool',
            'Pаypal', // Cyrillic a
            'Pool-7',
            'Pool_7',
            'Pool.',
            ' Pool',
            'Pool ',
            'Pool  7',
            'Pool\t7',
            'P‮loop',
            'P​ool',
            '',
            'a'.repeat(POOL_NAME_MAX_BYTES + 1),
        ]) {
            expect(isPoolName(bad), JSON.stringify(bad)).toBe(false);
        }
    });
});

describe('isPoolUrl', () => {
    it('takes a plain https URL with a lowercase dotted host', () => {
        expect(isPoolUrl('https://x.com/orbinum?ref=1#top')).toBe(true);
        expect(isPoolUrl('https://xn--bcher-kva.example/')).toBe(true);
        for (const bad of [
            'http://x.com',
            'javascript:alert(1)',
            'https://user:pw@x.com',
            'https://X.com',
            'https://x.com:8443/',
            'https://localhost/',
            'https://x.com/a b',
            'https://x.com/"><script>',
            'https://-x.com',
        ]) {
            expect(isPoolUrl(bad), bad).toBe(false);
        }
    });
});

describe('poolProfileRefusal', () => {
    it('refuses a name that is not plain letters and digits', () => {
        expect(poolProfileRefusal({ name: 'Orbinum 🌊', url: null })).toBe('NameInvalid');
        expect(poolProfileRefusal({ name: 'Señor', url: null })).toBe('NameInvalid');
        expect(poolProfileRefusal({ name: 'A\nroot: me', url: null })).toBe('NameInvalid');
        expect(poolProfileRefusal({ name: 'Pool  7', url: null })).toBe('NameInvalid');
        expect(poolProfileRefusal({ name: 'a'.repeat(POOL_NAME_MAX_BYTES + 1), url: null })).toBe(
            'NameTooLong'
        );
    });

    it('takes https links only, after a name', () => {
        const refusal = (url: string) => poolProfileRefusal({ name: 'P', url });
        expect(refusal('https://x.com/orbinum')).toBeNull();
        expect(refusal('http://x.com')).toBe('UrlNotHttps');
        expect(refusal('javascript:alert(1)')).toBe('UrlNotHttps');
        expect(refusal('https://user:pw@x.com')).toBe('UrlHasCredentials');
        expect(refusal('https://x.com:8443')).toBe('UrlInvalid');
        expect(refusal('https://localhost')).toBe('UrlInvalid');
        expect(refusal('x.com')).toBe('UrlInvalid');
        expect(poolProfileRefusal({ name: '', url: 'https://x.com' })).toBe('NameRequired');
    });

    it('refuses a profile over the metadata limit', () => {
        const name = 'a'.repeat(POOL_NAME_MAX_BYTES);
        const prefix = 'https://x.co/';
        const fits = prefix + 'p'.repeat(POOL_METADATA_MAX_BYTES - name.length - 1 - prefix.length);
        expect(poolProfileRefusal({ name, url: fits })).toBeNull();
        expect(poolProfileRefusal({ name, url: `${fits}p` })).toBe('TooLong');
        expect(() => encodePoolMetadata({ name, url: `${fits}p` })).toThrow('setMetadata: TooLong');
    });
});

describe('reading metadata back', () => {
    it('decodes exactly what the runtime takes, and nothing else', () => {
        expect(decodePoolProfile(bytes(''))).toEqual({ name: '', url: null });
        // A BOM stays part of the name, as the runtime reads it: refused.
        expect(decodePoolProfile(new Uint8Array([0xef, 0xbb, 0xbf, 0x50]))).toBeNull();
        expect(decodePoolProfile(bytes('Orbinum 🌊'))).toBeNull();
        expect(decodePoolProfile(bytes('A\nhttp://x.com'))).toBeNull();
        expect(decodePoolProfile(bytes('A\nhttps://x.com\nextra'))).toBeNull();
        expect(decodePoolProfile(Uint8Array.of(0xff, 0x00))).toBeNull();
    });

    it('shows metadata the rule refuses as no profile, as the indexer and the runtime read it', () => {
        expect(parsePoolMetadata('Legacy 🌊 name')).toEqual({ name: '', url: null });
        expect(parsePoolMetadata('Legacy name')).toEqual({ name: 'Legacy name', url: null });
        expect(parsePoolMetadata('A\njavascript:alert(1)')).toEqual({ name: '', url: null });
        expect(parsePoolMetadata('A\nhttps://x.com\nextra')).toEqual({ name: '', url: null });
    });
});

describe('normalizePoolUrl', () => {
    it('returns the link as stored, or null', () => {
        expect(normalizePoolUrl(' https://X.com/Orbinum ')).toBe('https://x.com/Orbinum');
        expect(normalizePoolUrl('ftp://x.com')).toBeNull();
    });
});

describe('isPunycodeUrl', () => {
    it('flags an internationalized host label, wherever it is', () => {
        expect(isPunycodeUrl('https://xn--pypal-4ve.com/')).toBe(true);
        expect(isPunycodeUrl('https://pool.xn--80ak6aa92e.com/a')).toBe(true);
        expect(isPunycodeUrl('https://orbinum.network/xn--path')).toBe(false);
        expect(isPunycodeUrl('https://orbinum.network/')).toBe(false);
    });
});
