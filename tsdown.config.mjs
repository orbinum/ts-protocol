import { defineConfig } from 'tsdown';

/**
 * Build config for the public SDK.
 *
 * Replaced `tsup` when this package moved to TypeScript 7: tsup's declaration
 * step goes through `rollup-plugin-dts`, which reaches into the TypeScript
 * compiler's internal API and throws on 7.x. tsdown emits declarations with the
 * installed `tsc` itself, so it follows the compiler rather than tracking it.
 *
 * `fixedExtension: false` keeps the emitted filenames as `.js` / `.mjs` /
 * `.d.ts`. tsdown defaults to `.cjs` / `.d.cts`, which is tidier in the abstract
 * and would silently rename every path in `exports` — the surface tests read
 * `dist/index.js` and `dist/index.d.ts`, and a consumer's lockfile pins what
 * `main` resolved to. The artefact is the contract; the bundler is an
 * implementation detail.
 *
 * Written as `.mjs` rather than `.ts` because a TypeScript config would make
 * the build depend on `unrun` to transpile itself.
 */
export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: { sourcemap: false },
    fixedExtension: false,
    outDir: 'dist',
    clean: true,
    sourcemap: false,
    platform: 'neutral',
});
