/**
 * Layers point one way: `foundation → protocol → chain`. A lower layer importing a
 * higher one fails here, by the path its import resolves to.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../src');
const RANK: Record<string, number> = { foundation: 0, protocol: 1, chain: 2 };

function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
    });
}

const layerOf = (path: string) => relative(SRC, path).split('/')[0]!;

function upwardImports(): string[] {
    const found: string[] = [];
    for (const file of files(SRC)) {
        const from = RANK[layerOf(file)];
        if (from === undefined) continue;
        const source = readFileSync(file, 'utf8');
        for (const [, spec] of source.matchAll(
            /(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]/g
        )) {
            const to = RANK[layerOf(resolve(dirname(file), spec!))];
            if (to !== undefined && to > from) found.push(`${relative(SRC, file)} → ${spec}`);
        }
    }
    return found;
}

describe('layering', () => {
    it('never imports a higher layer', () => {
        expect(upwardImports()).toEqual([]);
    });
});
