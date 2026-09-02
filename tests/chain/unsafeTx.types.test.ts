/**
 * `UnsafeTx` must stay assignable from PAPI's real `Transaction`.
 *
 * `UnsafeTx` is hand-written: the unsafe (untyped) api has no chain descriptors,
 * so PAPI's `Transaction` generic cannot be instantiated for it, and
 * `callUnsafeTx` reaches it through a cast. Nothing in the source compares the
 * two, so a polkadot-api rename leaves the interface stale and silently valid —
 * the failure surfaces as `tx.<method> is not a function` in a wallet at
 * signing time, which is exactly how the 2.x→3.x `signAndSubmit` →
 * `createAndSubmit` rename shipped.
 *
 * These are type-level assertions: they fail under `typecheck:all` (which
 * covers `tests/`), not at runtime. The runtime body only exists to give vitest
 * something to report.
 */
import { describe, it, expect } from 'vitest';
import type { Transaction } from 'polkadot-api';
import type { UnsafeTx } from '../../src/chain/tx';

/** Fails to compile when `T` is not `true`. */
type Expect<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;

// PAPI's Transaction satisfies every method UnsafeTx declares. Rename or
// reshape one of them upstream (or here) and this line stops the build.
type _PapiSatisfiesUnsafeTx = Expect<Extends<Transaction, UnsafeTx>>;

// Each method pinned individually, so a failure names the one that drifted
// rather than only the interface as a whole.
type _HasCreateAndSubmit = Expect<Extends<Transaction, Pick<UnsafeTx, 'createAndSubmit'>>>;
type _HasCreateSubmitAndWatch = Expect<
    Extends<Transaction, Pick<UnsafeTx, 'createSubmitAndWatch'>>
>;
type _HasGetBareTx = Expect<Extends<Transaction, Pick<UnsafeTx, 'getBareTx'>>>;

describe('UnsafeTx conformance with polkadot-api', () => {
    it('is pinned at the type level (see the assertions above)', () => {
        // The assertions are compile-time; nothing to run. This test exists so
        // the file is reported by vitest rather than silently absent.
        expect(true).toBe(true);
    });
});
