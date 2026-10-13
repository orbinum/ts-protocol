import { describe, it, expect, vi } from 'vitest';
import { assertSupportedRuntime, MIN_SPEC_VERSION } from '../../../src/chain/client/runtimeGuard';

const node = (runtime: unknown) => ({ request: vi.fn().mockResolvedValue(runtime) });

describe('assertSupportedRuntime', () => {
    it('accepts the minimum spec and later', async () => {
        await expect(assertSupportedRuntime(node({ specVersion: MIN_SPEC_VERSION }))).resolves.toBe(
            undefined
        );
        await expect(assertSupportedRuntime(node({ specVersion: 25 }))).resolves.toBe(undefined);
    });

    it('refuses an older or unreadable runtime version', async () => {
        await expect(assertSupportedRuntime(node({ specVersion: 18 }))).rejects.toThrow(
            /spec 18.*spec 19 or later/
        );
        await expect(assertSupportedRuntime(node({}))).rejects.toThrow(/Unsupported runtime/);
    });
});
