import { describe, expect, it } from 'vitest';

import { computeReadOnlyDiff } from '@/lib/diff/read-only';

describe('diff endpoint contract', () => {
  it('computes diff without mutating source entry payload', () => {
    const entry = {
      draft_fr: 'Je vais a la maison.',
      final_fr: 'Je vais tranquillement a la maison.'
    };

    const before = JSON.parse(JSON.stringify(entry));
    const diff = computeReadOnlyDiff(entry.draft_fr, entry.final_fr);

    expect(diff.tokens.length).toBeGreaterThan(0);
    expect(entry).toEqual(before);
  });
});
