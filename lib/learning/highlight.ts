import { diffWords } from "diff";

import { HighlightSuggestion, suggestHighlightColors } from "@/lib/ai/client";
import { highlightUnknownWords } from "@/lib/cefr/vocab";
import { CEFRLevel } from "@/lib/types";

export type LearningHighlights = {
  knownWords: string[];
  unknownWords: string[];
  grammarWords: string[];
};

const grammarFunctionWords = new Set([
  "à",
  "a",
  "au",
  "aux",
  "de",
  "des",
  "du",
  "d",
  "en",
  "dans",
  "sur",
  "sous",
  "avec",
  "sans",
  "pour",
  "par",
  "chez",
  "vers",
  "contre",
  "entre",
  "le",
  "la",
  "les",
  "l'",
  "un",
  "une",
  "des",
  "ce",
  "cet",
  "cette",
  "ces",
  "mon",
  "ton",
  "son",
  "ma",
  "ta",
  "sa",
  "mes",
  "tes",
  "ses",
  "je",
  "tu",
  "il",
  "elle",
  "on",
  "nous",
  "vous",
  "ils",
  "elles",
  "me",
  "te",
  "se",
  "m'",
  "t'",
  "s'",
  "y",
  "ne",
  "n'",
  "pas",
  "plus",
  "est",
  "sont",
  "ai",
  "as",
  "avons",
  "avez",
  "ont",
  "vais",
  "vas",
  "va",
  "allons",
  "allez",
  "vont",
  "suis",
  "es",
  "sommes",
  "êtes",
  "étais",
  "était",
]);

function normalizeWord(token: string): string {
  return token
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^[^a-zàâçéèêëîïôûùüÿñæœ']+|[^a-zàâçéèêëîïôûùüÿñæœ']+$/gi, "");
}

function words(text: string): string[] {
  return (text.match(/[A-Za-zÀ-ÿœŒæÆ'’]+/g) ?? [])
    .map((w) => normalizeWord(w))
    .filter(Boolean);
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) {
    index += 1;
  }
  return index;
}

function editDistanceWithin(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => (row === 0 ? col : col === 0 ? row : 0)),
  );

  for (let row = 1; row < rows; row += 1) {
    let minInRow = Number.POSITIVE_INFINITY;
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      dp[row][col] = Math.min(
        dp[row - 1][col] + 1,
        dp[row][col - 1] + 1,
        dp[row - 1][col - 1] + cost,
      );
      minInRow = Math.min(minInRow, dp[row][col]);
    }
    if (minInRow > limit) return false;
  }

  return dp[a.length][b.length] <= limit;
}

function isGrammarFunctionWord(word: string): boolean {
  return grammarFunctionWords.has(word);
}

function looksLikeInflectionCorrection(word: string, removedWords: string[]): boolean {
  const normalizedWord = stripDiacritics(word.replace(/'/g, ""));
  if (!normalizedWord) return false;

  return removedWords.some((removedWord) => {
    const normalizedRemoved = stripDiacritics(removedWord.replace(/'/g, ""));
    if (!normalizedRemoved || normalizedRemoved === normalizedWord) return false;

    const prefix = commonPrefixLength(normalizedWord, normalizedRemoved);
    if (prefix >= Math.max(4, Math.min(normalizedWord.length, normalizedRemoved.length) - 1)) {
      return true;
    }

    const distanceLimit = Math.max(1, Math.floor(Math.max(normalizedWord.length, normalizedRemoved.length) / 4));
    return editDistanceWithin(normalizedWord, normalizedRemoved, distanceLimit);
  });
}

export function buildLearningHighlights(
  draftFr: string,
  finalFr: string,
  cefrLevel: CEFRLevel,
): LearningHighlights {
  const changedFinalWords = new Set<string>();
  const grammarSet = new Set<string>();

  const parts = diffWords(draftFr ?? "", finalFr ?? "");
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part.added) continue;

    const addedWords = words(part.value);
    if (!addedWords.length) continue;

    const previousRemovedWords = parts[index - 1]?.removed ? words(parts[index - 1].value) : [];
    const nextRemovedWords = parts[index + 1]?.removed ? words(parts[index + 1].value) : [];
    const removedWords = [...previousRemovedWords, ...nextRemovedWords];

    for (const word of addedWords) {
      changedFinalWords.add(word);

      if (
        isGrammarFunctionWord(word) ||
        looksLikeInflectionCorrection(word, removedWords)
      ) {
        grammarSet.add(word);
      }
    }
  }

  const unknownSet = new Set(
    highlightUnknownWords(finalFr, cefrLevel)
      .filter((t) => t.unknown)
      .map((t) => normalizeWord(t.token))
      .filter((word) => Boolean(word) && changedFinalWords.has(word)),
  );

  const knownSet = new Set<string>();
  for (const word of changedFinalWords) {
    if (!unknownSet.has(word) && !grammarSet.has(word)) {
      knownSet.add(word);
    }
  }

  return {
    knownWords: [...knownSet],
    unknownWords: [...unknownSet],
    grammarWords: [...grammarSet],
  };
}

function unique(words: string[]): string[] {
  return [...new Set(words.filter(Boolean))];
}

function mergeHighlightSuggestions(
  baseline: LearningHighlights,
  suggestion: HighlightSuggestion | null,
): LearningHighlights {
  if (!suggestion) {
    return baseline;
  }

  const unknownSet = new Set([
    ...baseline.unknownWords,
    ...suggestion.unknownWords,
  ]);
  const grammarSet = new Set([
    ...baseline.grammarWords,
    ...suggestion.grammarWords.filter((word) => !unknownSet.has(word)),
  ]);
  const knownSet = new Set([
    ...baseline.knownWords.filter(
      (word) => !unknownSet.has(word) && !grammarSet.has(word),
    ),
    ...suggestion.knownWords.filter(
      (word) => !unknownSet.has(word) && !grammarSet.has(word),
    ),
  ]);

  return {
    knownWords: [...knownSet],
    unknownWords: [...unknownSet],
    grammarWords: [...grammarSet],
  };
}

export async function buildLearningHighlightsWithAI(
  draftFr: string,
  finalFr: string,
  cefrLevel: CEFRLevel,
): Promise<LearningHighlights> {
  const baseline = buildLearningHighlights(draftFr, finalFr, cefrLevel);
  const finalWords = unique(words(finalFr));
  const changedWords = unique(
    diffWords(draftFr ?? "", finalFr ?? "")
      .filter((part) => part.added)
      .flatMap((part) => words(part.value)),
  );

  if (!finalWords.length) {
    return baseline;
  }

  try {
    const suggestion = await suggestHighlightColors({
      draftFr,
      finalFr,
      cefrLevel,
      finalWords,
      changedWords,
      baseline,
    });

    return mergeHighlightSuggestions(baseline, suggestion);
  } catch {
    return baseline;
  }
}
