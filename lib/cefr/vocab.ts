import { CEFRLevel } from '@/lib/types';

const rank: Record<CEFRLevel, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6
};

const cefrLexicon: Array<{ word: string; level: CEFRLevel; lemma: string; meaning: string }> = [
  { word: 'bonjour', level: 'A1', lemma: 'bonjour', meaning: 'hello' },
  { word: 'maison', level: 'A1', lemma: 'maison', meaning: 'house' },
  { word: 'important', level: 'A2', lemma: 'important', meaning: 'important' },
  { word: 'découvrir', level: 'B1', lemma: 'découvrir', meaning: 'to discover' },
  { word: 'cependant', level: 'B2', lemma: 'cependant', meaning: 'however' },
  { word: 'épanouissement', level: 'C1', lemma: 'épanouissement', meaning: 'fulfillment' },
  { word: 'incommensurable', level: 'C2', lemma: 'incommensurable', meaning: 'immeasurable' }
];

const byWord = new Map(
  cefrLexicon.map((item) => [item.word.toLowerCase(), item] as const)
);

export interface HighlightToken {
  token: string;
  unknown: boolean;
  lemma?: string;
  meaning?: string;
}

function tokenize(text: string): string[] {
  return text.split(/(\s+|[,.!?;:()"'])/g).filter((x) => x.length > 0);
}

export function highlightUnknownWords(
  text: string,
  level: CEFRLevel,
  knownVocab: Set<string> = new Set()
): HighlightToken[] {
  const userRank = rank[level];
  return tokenize(text).map((token) => {
    const normalized = token.toLowerCase();
    const entry = byWord.get(normalized);
    if (!entry || /^\W+$/.test(token)) {
      return { token, unknown: false };
    }

    const known = knownVocab.has(entry.lemma);
    const unknown = !known && rank[entry.level] > userRank;

    return {
      token,
      unknown,
      lemma: entry.lemma,
      meaning: entry.meaning
    };
  });
}
