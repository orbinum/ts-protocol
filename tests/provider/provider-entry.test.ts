/**
 * `@orbinum/protocol/provider` is what a dapp imports, and it promises no peer at
 * runtime: a dapp that only talks to the wallet must not need polkadot-api. Checked on
 * the built files, which are what a dapp receives; the test is skipped until
 * `npm run build` has written them (`npm run check` builds before it tests).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = resolve(__dirname, '../../dist');
const ENTRIES = ['provider.mjs', 'provider.js'];
const built = ENTRIES.every((entry) => existsSync(join(DIST, entry)));

/** Every file `entry` loads, following relative imports through the shared chunks. */
function loaded(entry: string, seen = new Set<string>()): Set<string> {
    if (seen.has(entry)) return seen;
    seen.add(entry);
    const source = readFileSync(entry, 'utf8');
    for (const [, spec] of source.matchAll(
        /(?:(?:^|[\s;}])(?:from|import)\s*|require\(\s*)['"](\.[^'"]+)['"]/gm
    )) {
        loaded(resolve(dirname(entry), spec!), seen);
    }
    return seen;
}

describe.skipIf(!built)('the provider entry, as built', () => {
    it.each(ENTRIES)('%s loads no peer and no package but its own', (entry) => {
        const bare = new Set<string>();
        for (const file of loaded(join(DIST, entry))) {
            const source = readFileSync(file, 'utf8');
            for (const [, spec] of source.matchAll(
                /(?:(?:^|[\s;}])(?:from|import)\s*|require\(\s*)['"]([^.'"][^'"]*)['"]/gm
            )) {
                bare.add(spec!);
            }
        }
        expect([...bare]).toEqual([]);
    });

    it('ships its declarations', () => {
        expect(readdirSync(DIST)).toContain('provider.d.ts');
    });
});
