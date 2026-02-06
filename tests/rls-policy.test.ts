import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('RLS migration coverage', () => {
  it('contains per-table owner access policies to prevent cross-user access', () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/202602050001_init_photo_texte.sql'),
      'utf8'
    );

    expect(sql).toContain('alter table public.entries enable row level security;');
    expect(sql).toContain('create policy "users manage own entries"');
    expect(sql).toContain('using (auth.uid() = user_id)');

    expect(sql).toContain('alter table public.assets enable row level security;');
    expect(sql).toContain('create policy "users manage own assets"');

    expect(sql).toContain('alter table public.memos enable row level security;');
    expect(sql).toContain('create policy "users manage own memos"');
  });
});
