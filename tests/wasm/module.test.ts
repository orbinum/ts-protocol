/**
 * The built `orbinum-verify.wasm`, run as a WASI command the way a Python or Go
 * backend runs it: JSON on stdin, JSON on stdout. Skipped until the module is
 * built (`pnpm build:wasm`, which needs Javy); CI builds it and runs this.
 */
import {
    closeSync,
    existsSync,
    mkdtempSync,
    openSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WASI } from 'node:wasi';
import { describe, expect, it } from 'vitest';
import { handle } from '../../wasm/handle';
import { ADDRESS, PROOF_VECTORS } from '../protocol/payment/vectors';

/** The WebAssembly global, typed for this use: the tsconfig has no DOM lib. */
const { WebAssembly: wasm } = globalThis as unknown as {
    WebAssembly: {
        compile(bytes: Uint8Array): Promise<object>;
        instantiate(module: object, imports: object): Promise<object>;
    };
};

const MODULE = join(import.meta.dirname, '../../dist-wasm/orbinum-verify.wasm');
const built = existsSync(MODULE);

/** One WASI run: `input` on stdin, stdout parsed as JSON. */
async function run(input: string): Promise<unknown> {
    const dir = mkdtempSync(join(tmpdir(), 'orbinum-verify-'));
    try {
        writeFileSync(join(dir, 'in'), input);
        writeFileSync(join(dir, 'out'), '');
        const stdin = openSync(join(dir, 'in'), 'r');
        const stdout = openSync(join(dir, 'out'), 'w');
        try {
            const wasi = new WASI({
                version: 'preview1',
                stdin,
                stdout,
                stderr: 2,
                returnOnExit: true,
            });
            const module = await wasm.compile(readFileSync(MODULE));
            const instance = await wasm.instantiate(module, wasi.getImportObject());
            wasi.start(instance as Parameters<WASI['start']>[0]);
        } finally {
            closeSync(stdin);
            closeSync(stdout);
        }
        return JSON.parse(readFileSync(join(dir, 'out'), 'utf8'));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/** CI builds the module before testing: there, a missing one is a failure, not a skip. */
const required = process.env['ORBINUM_REQUIRE_WASM'] === '1';

it.runIf(required)('orbinum-verify.wasm is built', () => {
    expect(built, `${MODULE} missing: run pnpm build:wasm`).toBe(true);
});

describe.skipIf(!built)('orbinum-verify.wasm', () => {
    for (const v of PROOF_VECTORS) {
        it(`${v.name}: same answer as the TypeScript`, async () => {
            const request = {
                proof: v.proof,
                address: ADDRESS,
                value: v.expected?.value ?? '1',
                assetId: v.expected?.assetId ?? '0',
            };
            expect(await run(JSON.stringify(request))).toEqual(handle(request));
        });
    }

    it('answers garbage with an error, not a crash', async () => {
        expect(await run('{nope')).toEqual({ error: 'input is not JSON' });
    });
});
