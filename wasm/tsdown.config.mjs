import { defineConfig } from 'tsdown';

/**
 * The bundle `orbinum-verify.wasm` is compiled from (`pnpm build:wasm`): one
 * self-contained script — every dependency inlined, since a WASI module has no
 * `node_modules` — handed to Javy. Paths are relative to this directory.
 */
export default defineConfig({
    entry: { verify: './main.ts' },
    format: 'iife',
    platform: 'neutral',
    minify: true,
    dts: false,
    outDir: '../dist-wasm',
    clean: true,
    deps: { alwaysBundle: [/./] },
    outputOptions: { entryFileNames: '[name].js' },
});
