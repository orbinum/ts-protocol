/**
 * `orbinum-verify.wasm`: a WASI command built with Javy. Reads one JSON request
 * on stdin, writes one JSON answer on stdout (see `handle.ts`).
 */
// First: modules below need `atob` while they load. Imported by name, so the
// package's `sideEffects: false` cannot drop it.
import { installAtob } from './atob';
import { handle } from './handle';

declare const Javy: {
    IO: {
        readSync(fd: number, buffer: Uint8Array): number;
        writeSync(fd: number, buffer: Uint8Array): number;
    };
};

/** Requests are a few hundred bytes; anything past this is refused unread. */
const MAX_INPUT = 16 * 1024;

function readStdin(): Uint8Array | null {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const buffer = new Uint8Array(4096);
        const read = Javy.IO.readSync(0, buffer);
        if (read === 0) break;
        total += read;
        if (total > MAX_INPUT) return null;
        chunks.push(buffer.subarray(0, read));
    }
    const all = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.length;
    }
    return all;
}

function answer(): unknown {
    const bytes = readStdin();
    if (!bytes) return { error: `input larger than ${MAX_INPUT} bytes` };
    let input: unknown;
    try {
        input = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return { error: 'input is not JSON' };
    }
    return handle(input);
}

installAtob();
Javy.IO.writeSync(1, new TextEncoder().encode(`${JSON.stringify(answer())}\n`));
