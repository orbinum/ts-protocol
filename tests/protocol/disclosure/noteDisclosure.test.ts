import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { poseidon4 } from 'poseidon-lite';
import {
    createNoteDisclosureKey,
    decodeNoteDisclosureKey,
    type NoteDisclosure,
    type NoteDisclosureInput,
} from '../../../src/protocol/disclosure/noteDisclosure';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<NoteDisclosureInput> = {}): NoteDisclosureInput {
    const value = overrides.value ?? 1_000_000n;
    const assetId = overrides.assetId ?? 0n;
    const ownerPk = overrides.ownerPk ?? 123456789n;
    const blinding = overrides.blinding ?? 987654321n;
    const commitment = overrides.commitment ?? poseidon4([value, assetId, ownerPk, blinding]);

    return { value, assetId, ownerPk, blinding, commitment };
}

// ─── createNoteDisclosureKey ──────────────────────────────────────────────────

describe('createNoteDisclosureKey', () => {
    it('returns a string starting with "orbdisc:"', () => {
        const key = createNoteDisclosureKey(makeInput());
        expect(key).toMatch(/^orbdisc:/);
    });

    it('is deterministic for the same note', () => {
        const input = makeInput();
        expect(createNoteDisclosureKey(input)).toBe(createNoteDisclosureKey(input));
    });

    it('produces different keys for different values', () => {
        const a = createNoteDisclosureKey(makeInput({ value: 100n }));
        const b = createNoteDisclosureKey(makeInput({ value: 200n }));
        expect(a).not.toBe(b);
    });

    it('produces different keys for different assetIds', () => {
        const a = createNoteDisclosureKey(makeInput({ assetId: 0n }));
        const b = createNoteDisclosureKey(makeInput({ assetId: 1n }));
        expect(a).not.toBe(b);
    });

    it('produces different keys for different ownerPks', () => {
        const a = createNoteDisclosureKey(makeInput({ ownerPk: 1n }));
        const b = createNoteDisclosureKey(makeInput({ ownerPk: 2n }));
        expect(a).not.toBe(b);
    });

    it('never carries a spending key or nullifier field (spending privacy preserved)', () => {
        // The INPUT type already cannot hold a spending key — this pins the
        // wire payload to the same promise, so a future field addition that
        // widens the input cannot silently widen the disclosure.
        const key = createNoteDisclosureKey(makeInput());
        const b64 = key.slice('orbdisc:'.length).replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64));
        expect(payload).not.toHaveProperty('sk');
        expect(payload).not.toHaveProperty('spendingKey');
        expect(payload).not.toHaveProperty('nullifier');
    });

    it('encodes all required fields in the payload', () => {
        const key = createNoteDisclosureKey(makeInput());
        const b64 = key.slice('orbdisc:'.length).replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64));
        expect(payload).toHaveProperty('v');
        expect(payload).toHaveProperty('c');
        expect(payload).toHaveProperty('val');
        expect(payload).toHaveProperty('aid');
        expect(payload).toHaveProperty('opk');
        expect(payload).toHaveProperty('bld');
    });

    it('uses base64url encoding (no +, /, or = characters after prefix)', () => {
        const key = createNoteDisclosureKey(makeInput());
        const encoded = key.slice('orbdisc:'.length);
        expect(encoded).not.toContain('+');
        expect(encoded).not.toContain('/');
        expect(encoded).not.toContain('=');
    });
});

// ─── Portability ──────────────────────────────────────────────────────────────

describe('portability', () => {
    // React Native has neither `btoa` nor `atob`. A disclosure key the official
    // mobile wallet cannot produce or read is not a shareable format, so the
    // module must round-trip with both globals absent.
    const saved = {
        btoa: globalThis.btoa,
        atob: globalThis.atob,
    };

    beforeEach(() => {
        delete (globalThis as { btoa?: unknown }).btoa;
        delete (globalThis as { atob?: unknown }).atob;
    });

    afterEach(() => {
        globalThis.btoa = saved.btoa;
        globalThis.atob = saved.atob;
    });

    it('round-trips a key without btoa or atob', () => {
        const input = makeInput();

        const decoded = decodeNoteDisclosureKey(createNoteDisclosureKey(input));

        expect(decoded).not.toBeNull();
        expect(decoded?.value).toBe(input.value);
        expect(decoded?.commitment).toBe(input.commitment);
    });

    it('produces the SAME key a btoa-capable runtime does', () => {
        // Desktop encodes, mobile decodes. If the two encoders disagreed by one
        // character the key would simply fail to verify on the other device.
        const input = makeInput();
        const withoutGlobals = createNoteDisclosureKey(input);

        globalThis.btoa = saved.btoa;
        globalThis.atob = saved.atob;

        expect(createNoteDisclosureKey(input)).toBe(withoutGlobals);
    });
});

// ─── decodeNoteDisclosureKey ──────────────────────────────────────────────────

describe('decodeNoteDisclosureKey', () => {
    it('decodes a valid key and returns all fields', () => {
        const input = makeInput();
        const key = createNoteDisclosureKey(input);
        const result = decodeNoteDisclosureKey(key);
        expect(result).not.toBeNull();
        expect(result!.value).toBe(input.value);
        expect(result!.assetId).toBe(input.assetId);
        expect(result!.ownerPk).toBe(input.ownerPk);
        expect(result!.blinding).toBe(input.blinding);
        expect(result!.commitment).toBe(input.commitment);
    });

    it('cryptographically verifies the commitment matches Poseidon4', () => {
        const key = createNoteDisclosureKey(makeInput());
        const result = decodeNoteDisclosureKey(key)!;
        const recomputed = poseidon4([
            result.value,
            result.assetId,
            result.ownerPk,
            result.blinding,
        ]);
        expect(recomputed).toBe(result.commitment);
    });

    it('returns null for wrong prefix', () => {
        expect(decodeNoteDisclosureKey('wrongprefix:abc')).toBeNull();
        expect(decodeNoteDisclosureKey('disc:abc')).toBeNull();
        expect(decodeNoteDisclosureKey('ORBDISC:abc')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(decodeNoteDisclosureKey('')).toBeNull();
    });

    it('returns null for only the prefix', () => {
        expect(decodeNoteDisclosureKey('orbdisc:')).toBeNull();
    });

    it('returns null for malformed base64', () => {
        expect(decodeNoteDisclosureKey('orbdisc:!!!invalid!!!')).toBeNull();
    });

    it('returns null for invalid JSON inside base64', () => {
        const bad = btoa('not-json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        expect(decodeNoteDisclosureKey('orbdisc:' + bad)).toBeNull();
    });

    it('returns null for unknown version', () => {
        const key = createNoteDisclosureKey(makeInput());
        const b64 = key.slice('orbdisc:'.length).replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64));
        payload.v = 99;
        const tampered = btoa(JSON.stringify(payload))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        expect(decodeNoteDisclosureKey('orbdisc:' + tampered)).toBeNull();
    });

    it('returns null when commitment does not match preimage (tampered commitment)', () => {
        const input = makeInput();
        const key = createNoteDisclosureKey(input);
        const b64 = key.slice('orbdisc:'.length).replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64));
        payload.c = '0x' + (input.commitment + 1n).toString(16);
        const tampered = btoa(JSON.stringify(payload))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        expect(decodeNoteDisclosureKey('orbdisc:' + tampered)).toBeNull();
    });

    it('returns null when value is tampered (preimage mismatch)', () => {
        const input = makeInput();
        const key = createNoteDisclosureKey(input);
        const b64 = key.slice('orbdisc:'.length).replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64));
        payload.val = '0x' + (input.value + 1n).toString(16);
        const tampered = btoa(JSON.stringify(payload))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        expect(decodeNoteDisclosureKey('orbdisc:' + tampered)).toBeNull();
    });

    it('returns null when assetId is tampered (preimage mismatch)', () => {
        const input = makeInput();
        const key = createNoteDisclosureKey(input);
        const b64 = key.slice('orbdisc:'.length).replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64));
        payload.aid = '0x' + (input.assetId + 1n).toString(16);
        const tampered = btoa(JSON.stringify(payload))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        expect(decodeNoteDisclosureKey('orbdisc:' + tampered)).toBeNull();
    });

    it('returns null when ownerPk is tampered (preimage mismatch)', () => {
        const input = makeInput();
        const key = createNoteDisclosureKey(input);
        const b64 = key.slice('orbdisc:'.length).replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64));
        payload.opk = '0x' + (input.ownerPk + 1n).toString(16);
        const tampered = btoa(JSON.stringify(payload))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        expect(decodeNoteDisclosureKey('orbdisc:' + tampered)).toBeNull();
    });

    it('returns null when blinding is tampered (preimage mismatch)', () => {
        const input = makeInput();
        const key = createNoteDisclosureKey(input);
        const b64 = key.slice('orbdisc:'.length).replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64));
        payload.bld = '0x' + (input.blinding + 1n).toString(16);
        const tampered = btoa(JSON.stringify(payload))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        expect(decodeNoteDisclosureKey('orbdisc:' + tampered)).toBeNull();
    });

    it('does not expose spendingKey or nullifier in the decoded result', () => {
        const key = createNoteDisclosureKey(makeInput());
        const result = decodeNoteDisclosureKey(key)! as NoteDisclosure & Record<string, unknown>;
        expect(result).not.toHaveProperty('spendingKey');
        expect(result).not.toHaveProperty('nullifier');
    });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('createNoteDisclosureKey / decodeNoteDisclosureKey round-trip', () => {
    it('preserves all fields across encode → decode', () => {
        const input = makeInput({ value: 500n, assetId: 3n, ownerPk: 42n, blinding: 7n });
        const key = createNoteDisclosureKey(input);
        const decoded = decodeNoteDisclosureKey(key)!;
        expect(decoded.value).toBe(input.value);
        expect(decoded.assetId).toBe(input.assetId);
        expect(decoded.ownerPk).toBe(input.ownerPk);
        expect(decoded.blinding).toBe(input.blinding);
        expect(decoded.commitment).toBe(input.commitment);
    });

    it('works for zero-value note (edge case)', () => {
        const input = makeInput({ value: 0n, assetId: 0n, ownerPk: 0n, blinding: 1n });
        const key = createNoteDisclosureKey(input);
        const decoded = decodeNoteDisclosureKey(key)!;
        expect(decoded).not.toBeNull();
        expect(decoded.value).toBe(0n);
        expect(decoded.commitment).toBe(input.commitment);
    });

    it('works for large bigint values', () => {
        const input = makeInput({
            value: 2n ** 128n - 1n,
            assetId: 255n,
            ownerPk: 2n ** 64n,
            blinding: 2n ** 64n + 1n,
        });
        const key = createNoteDisclosureKey(input);
        const decoded = decodeNoteDisclosureKey(key)!;
        expect(decoded).not.toBeNull();
        expect(decoded.value).toBe(input.value);
        expect(decoded.assetId).toBe(input.assetId);
        expect(decoded.ownerPk).toBe(input.ownerPk);
        expect(decoded.blinding).toBe(input.blinding);
        expect(decoded.commitment).toBe(input.commitment);
    });

    it('different notes produce different disclosure keys', () => {
        const a = createNoteDisclosureKey(makeInput({ value: 100n }));
        const b = createNoteDisclosureKey(makeInput({ value: 101n }));
        expect(a).not.toBe(b);
    });

    it('decoding noteA key with noteB data fails verification (cross-note forgery)', () => {
        const inputA = makeInput({ value: 100n });
        // Build a key that has noteA's commitment but noteB's value → should fail Poseidon check
        const keyA = createNoteDisclosureKey(inputA);
        const b64 = keyA.slice('orbdisc:'.length).replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64));
        payload.val = '0x' + 200n.toString(16); // swap value, keep commitment
        const forged = btoa(JSON.stringify(payload))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        expect(decodeNoteDisclosureKey('orbdisc:' + forged)).toBeNull();
    });
});
