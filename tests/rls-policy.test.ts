import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Cloudflare ownership enforcement', () => {
  it('scopes every user-owned D1 table and rejects unscoped deletes', () => {
    const client = fs.readFileSync(
      path.join(process.cwd(), 'lib/cloudflare/client.ts'),
      'utf8'
    );

    expect(client).toContain("user_profiles: { scope: 'id'");
    for (const table of ['assets', 'entries', 'entry_photos', 'memos', 'exports']) {
      expect(client).toContain(`${table}: { scope: 'user_id'`);
    }
    expect(client).toContain('conditions.push({ column: scope, values: [this.userId]');
    expect(client).toContain('Refusing unscoped delete');
  });
});
