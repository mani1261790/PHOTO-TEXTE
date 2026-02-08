import { CEFRLevel } from '@/lib/types';

const rank: Record<CEFRLevel, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6
};

type LexiconEntry = {
  word: string;
  level: CEFRLevel;
  lemma: string;
  meaning: string;
};

const cefrLexicon: LexiconEntry[] = [
  { word: 'bonjour', level: 'A1', lemma: 'bonjour', meaning: 'hello' },
  { word: 'maison', level: 'A1', lemma: 'maison', meaning: 'house' },
  { word: 'école', level: 'A1', lemma: 'école', meaning: 'school' },
  { word: 'photo', level: 'A1', lemma: 'photo', meaning: 'photo' },
  { word: 'important', level: 'A2', lemma: 'important', meaning: 'important' },
  { word: 'penser', level: 'A2', lemma: 'penser', meaning: 'to think' },
  { word: 'histoire', level: 'A2', lemma: 'histoire', meaning: 'story' },
  { word: 'découvrir', level: 'B1', lemma: 'découvrir', meaning: 'to discover' },
  { word: 'progresser', level: 'B1', lemma: 'progresser', meaning: 'to progress' },
  { word: 'cependant', level: 'B2', lemma: 'cependant', meaning: 'however' },
  { word: 'néanmoins', level: 'B2', lemma: 'néanmoins', meaning: 'nevertheless' },
  { word: 'épanouissement', level: 'C1', lemma: 'épanouissement', meaning: 'fulfillment' },
  { word: 'incommensurable', level: 'C2', lemma: 'incommensurable', meaning: 'immeasurable' }
];

const byWord = new Map(cefrLexicon.map((item) => [item.word, item] as const));

const frequentFunctionWords = new Set([
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'du',
  'de',
  'd',
  'au',
  'aux',
  'et',
  'ou',
  'mais',
  'donc',
  'or',
  'ni',
  'car',
  'je',
  'tu',
  'il',
  'elle',
  'on',
  'nous',
  'vous',
  'ils',
  'elles',
  'me',
  'te',
  'se',
  'mon',
  'ton',
  'son',
  'ma',
  'ta',
  'sa',
  'mes',
  'tes',
  'ses',
  'ce',
  'cet',
  'cette',
  'ces',
  'dans',
  'sur',
  'sous',
  'avec',
  'sans',
  'pour',
  'par',
  'en',
  'à',
  'est',
  'sont',
  'été',
  'a',
  'ont'
]);

export interface HighlightToken {
  token: string;
  unknown: boolean;
  lemma?: string;
  meaning?: string;
}

function tokenize(text: string): string[] {
  return text.split(/(\s+|[,.!?;:()"'])/g).filter((x) => x.length > 0);
}

function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/^[^a-zàâçéèêëîïôûùüÿñæœ]+|[^a-zàâçéèêëîïôûùüÿñæœ']+$/gi, '');
}

function candidateLemmas(token: string): string[] {
  const candidates = new Set<string>([token]);

  if (token.includes("'")) {
    const parts = token.split("'");
    const tail = parts.at(-1);
    if (tail) {
      candidates.add(tail);
    }
  }

  if (token.endsWith('es') && token.length > 4) {
    candidates.add(token.slice(0, -2));
  }
  if (token.endsWith('s') && token.length > 3) {
    candidates.add(token.slice(0, -1));
  }
  if (token.endsWith('e') && token.length > 3) {
    candidates.add(token.slice(0, -1));
  }

  return [...candidates];
}

export function highlightUnknownWords(
  text: string,
  level: CEFRLevel,
  knownVocab: Set<string> = new Set()
): HighlightToken[] {
  const userRank = rank[level];

  return tokenize(text).map((token) => {
    const normalized = normalizeToken(token);

    if (!normalized || /^\W+$/u.test(token)) {
      return { token, unknown: false };
    }

    if (frequentFunctionWords.has(normalized)) {
      return { token, unknown: false };
    }

    const entry = candidateLemmas(normalized)
      .map((lemma) => byWord.get(lemma))
      .find((x): x is LexiconEntry => Boolean(x));

    if (!entry) {
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
