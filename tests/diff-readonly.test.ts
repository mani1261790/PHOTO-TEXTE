import { describe, expect, it } from 'vitest';

import { computeReadOnlyDiff, reconstructDiffSides } from '@/lib/diff/read-only';

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

  it('reconstructs separate original and corrected text from tokens', () => {
    const diff = computeReadOnlyDiff(
      'Je vais a la maison.',
      'Je vais tranquillement à la maison.'
    );

    expect(reconstructDiffSides(diff.tokens)).toEqual({
      before: 'Je vais a la maison.',
      after: 'Je vais tranquillement à la maison.'
    });
  });
});
