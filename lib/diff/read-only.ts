import { diffWords } from 'diff';

export type DiffToken = {
  value: string;
  kind: 'add' | 'remove' | 'same';
};

export interface ReadOnlyDiff {
  before: string;
  after: string;
  tokens: DiffToken[];
}

export function computeReadOnlyDiff(before: string, after: string): ReadOnlyDiff {
  const tokens: DiffToken[] = diffWords(before, after).map((part) => ({
    value: part.value,
    kind: part.added ? 'add' : part.removed ? 'remove' : 'same'
  }));

  return {
    before,
    after,
    tokens
  };
}

export function reconstructDiffSides(tokens: DiffToken[]): Pick<ReadOnlyDiff, 'before' | 'after'> {
  return tokens.reduce(
    (result, token) => {
      if (token.kind !== 'add') result.before += token.value;
      if (token.kind !== 'remove') result.after += token.value;
      return result;
    },
    { before: '', after: '' }
  );
}
