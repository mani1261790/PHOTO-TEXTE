import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/errors';
import { assertDraftMutable } from '@/lib/entries/state';

describe('entry state machine', () => {
  it('rejects draft updates after intent lock', () => {
    expect(() => assertDraftMutable('JP_INTENT_LOCKED')).toThrowError(ApiError);

    try {
      assertDraftMutable('JP_INTENT_LOCKED');
    } catch (error) {
      const apiError = error as ApiError;
      expect(apiError.status).toBe(403);
      expect(apiError.code).toBe('ENTRY_LOCKED');
    }
  });
});
