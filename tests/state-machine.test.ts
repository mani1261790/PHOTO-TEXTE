import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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

  it('allows only final French edits after finalization and freezes them after export', () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/202608050001_allow_final_fr_edits.sql'),
      'utf8'
    );

    const finalReadyRule = sql.slice(
      sql.indexOf("if old.status = 'FINAL_FR_READY'"),
      sql.indexOf("if old.status = 'EXPORTED'")
    );
    const exportedRule = sql.slice(sql.indexOf("if old.status = 'EXPORTED'"));

    expect(finalReadyRule).not.toContain('new.final_fr is distinct from old.final_fr');
    expect(exportedRule).toContain('new.final_fr is distinct from old.final_fr');
  });
});
