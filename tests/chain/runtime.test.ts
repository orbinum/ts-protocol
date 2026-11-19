import { describe, expect, expectTypeOf, it } from 'vitest';
import {
    EVENT_FIELDS_SPEC,
    eventFieldNames,
    type EventFields,
    type EventFieldName,
} from '../../src/chain/runtime/index';
import { MIN_SPEC_VERSION } from '../../src/chain/client/runtimeGuard';

describe('runtime event fields', () => {
    it('are read from a runtime this SDK supports', () => {
        // Fields are optional when read, so a newer runtime's list types an older
        // runtime's events too: spec 24 only added fields, no calls changed.
        expect(EVENT_FIELDS_SPEC).toBeGreaterThanOrEqual(MIN_SPEC_VERSION);
    });

    it('name each event’s fields as the metadata does', () => {
        expect(eventFieldNames('PrivateStaking', 'Entered')).toEqual([
            'pool_id',
            'value',
            'era',
            'owner_pk',
        ]);
        expect(eventFieldNames('ShieldedPool', 'Shielded')).toContain('leaf_index');
        expect(eventFieldNames('Nope', 'Entered')).toBeUndefined();
    });

    it('type a field read by name', () => {
        expectTypeOf<EventFieldName<'PrivateStaking', 'Exited'>>().toEqualTypeOf<
            'pool_id' | 'shares' | 'value' | 'unlock_era' | 'owner_pk'
        >();
        expectTypeOf<EventFields<'PrivateStaking', 'PoolClosed'>>().toEqualTypeOf<{
            readonly pool_id?: unknown;
        }>();
    });
});
