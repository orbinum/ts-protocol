/**
 * A struct type's encoding and hash (EIP-712 `encodeType`, `typeHash`): the type's
 * own signature, then every struct it reaches, each once, sorted by name.
 */
import { keccak_256 } from '@noble/hashes/sha3.js';
import type { TypedDataField } from './typed-data';

type Types = Record<string, TypedDataField[]>;

/** `T[]` / `T[3]` → `T`, recursively. */
export function baseTypeOf(type: string): string {
    return type.replace(/(\[\d*\])+$/, '');
}

/** `encodeType(primaryType)`, e.g. `Mail(Person from,Person to,string contents)Person(…)`. */
export function encodeTypedDataType(primaryType: string, types: Types): string {
    const [primary, ...rest] = [...structsReachedFrom(primaryType, types)];
    const ordered = [primary!, ...rest.toSorted()];
    return ordered
        .map((name) => `${name}(${types[name]!.map((f) => `${f.type} ${f.name}`).join(',')})`)
        .join('');
}

/** `keccak256(encodeType(type))`. */
export function typedDataTypeHash(primaryType: string, types: Types): Uint8Array {
    return keccak_256(new TextEncoder().encode(encodeTypedDataType(primaryType, types)));
}

/** `type` first, then every struct type it references, directly or through others. */
function structsReachedFrom(type: string, types: Types): Set<string> {
    if (types[type] === undefined) throw new Error(`typedData.types: no struct named "${type}"`);
    const found = new Set<string>();
    const visit = (name: string) => {
        if (found.has(name) || types[name] === undefined) return;
        found.add(name);
        for (const field of types[name]) visit(baseTypeOf(field.type));
    };
    visit(type);
    return found;
}
