import { diffWords } from "diff";

import { HighlightSuggestion, suggestHighlightColors } from "@/lib/ai/client";
import { highlightUnknownWords } from "@/lib/cefr/vocab";
import { DiffToken, computeReadOnlyDiff } from "@/lib/diff/read-only";
import { CEFRLevel } from "@/lib/types";

export type SavedHighlightKind = "none" | "grammar" | "known" | "unknown";

export type LearningHighlights = {
  knownWords: string[];
  unknownWords: string[];
  grammarWords: string[];
  tokenSignature?: string | null;
  wordClassByKey?: Record<string, SavedHighlightKind>;
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

export function normalizeLearningWord(token: string): string {
  return token
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^[^a-zàâçéèêëîïôûùüÿñæœ']+|[^a-zàâçéèêëîïôûùüÿñæœ']+$/gi, "");
}

function words(text: string): string[] {
  return (text.match(/[A-Za-zÀ-ÿœŒæÆ'’]+/g) ?? [])
    .map((w) => normalizeLearningWord(w))
    .filter(Boolean);
}

export function splitLearningText(value: string): string[] {
  return value.split(/(\s+)/g).filter((x) => x.length > 0);
}

export function getLearningTokenSignature(tokens: DiffToken[]): string {
  return tokens.map((token) => `${token.kind}:${token.value}`).join("\u241f");
}

function normalizeSavedHighlightKind(value: unknown): SavedHighlightKind | null {
  return value === "none" ||
    value === "grammar" ||
    value === "known" ||
    value === "unknown"
    ? value
    : null;
}

function uniqueNormalized(words: string[]): string[] {
  return [...new Set(words.map((word) => normalizeLearningWord(word)).filter(Boolean))];
}

export function normalizeLearningHighlights(input: unknown): LearningHighlights | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const value = input as {
    knownWords?: unknown;
    unknownWords?: unknown;
    grammarWords?: unknown;
    tokenSignature?: unknown;
    wordClassByKey?: unknown;
  };

  const wordClassByKey =
    value.wordClassByKey && typeof value.wordClassByKey === "object"
      ? Object.fromEntries(
          Object.entries(value.wordClassByKey as Record<string, unknown>)
            .map(([key, kind]) => [key, normalizeSavedHighlightKind(kind)] as const)
            .filter((entry): entry is [string, SavedHighlightKind] => Boolean(entry[1])),
        )
      : {};

  return {
    knownWords: uniqueNormalized(Array.isArray(value.knownWords) ? value.knownWords.filter((word): word is string => typeof word === "string") : []),
    unknownWords: uniqueNormalized(Array.isArray(value.unknownWords) ? value.unknownWords.filter((word): word is string => typeof word === "string") : []),
    grammarWords: uniqueNormalized(Array.isArray(value.grammarWords) ? value.grammarWords.filter((word): word is string => typeof word === "string") : []),
    tokenSignature: typeof value.tokenSignature === "string" ? value.tokenSignature : null,
    wordClassByKey,
  };
}

function resolveDefaultKind(
  word: string,
  fallbackKind: SavedHighlightKind,
  grammarSet: Set<string>,
  knownSet: Set<string>,
  unknownSet: Set<string>,
): SavedHighlightKind {
  if (!word) return "none";
  if (unknownSet.has(word)) return "unknown";
  if (grammarSet.has(word)) return "grammar";
  if (knownSet.has(word)) return "known";
  return fallbackKind;
}

export function buildEffectiveLearningHighlights(
  tokens: DiffToken[],
  learningHighlights: LearningHighlights,
): LearningHighlights {
  const grammarSet = new Set(
    (learningHighlights.grammarWords ?? []).map(normalizeLearningWord).filter(Boolean),
  );
  const knownSet = new Set(
    (learningHighlights.knownWords ?? []).map(normalizeLearningWord).filter(Boolean),
  );
  const unknownSet = new Set(
    (learningHighlights.unknownWords ?? []).map(normalizeLearningWord).filter(Boolean),
  );
  const tokenSignature = getLearningTokenSignature(tokens);
  const applyOverrides = learningHighlights.tokenSignature === tokenSignature;
  const savedOverrides = applyOverrides ? learningHighlights.wordClassByKey ?? {} : {};

  const effectiveGrammar = new Set<string>();
  const effectiveKnown = new Set<string>();
  const effectiveUnknown = new Set<string>();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === "remove") continue;

    const fallbackKind: SavedHighlightKind = token.kind === "add" ? "grammar" : "none";
    const parts = splitLearningText(token.value);
    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const part = parts[partIndex];
      const word = normalizeLearningWord(part);
      if (!word) continue;

      const overrideKey = `${index}-${partIndex}`;
      const kind =
        savedOverrides[overrideKey] ??
        resolveDefaultKind(word, fallbackKind, grammarSet, knownSet, unknownSet);

      if (kind === "grammar") effectiveGrammar.add(word);
      else if (kind === "known") effectiveKnown.add(word);
      else if (kind === "unknown") effectiveUnknown.add(word);
    }
  }

  for (const word of effectiveUnknown) {
    effectiveKnown.delete(word);
    effectiveGrammar.delete(word);
  }
  for (const word of effectiveGrammar) {
    effectiveKnown.delete(word);
  }

  return {
    knownWords: [...effectiveKnown],
    unknownWords: [...effectiveUnknown],
    grammarWords: [...effectiveGrammar],
    tokenSignature,
    wordClassByKey: savedOverrides,
  };
}

export function buildLearningHighlightsFromDiff(
  draftFr: string,
  finalFr: string,
  learningHighlights: LearningHighlights,
): LearningHighlights {
  const diff = computeReadOnlyDiff(draftFr ?? "", finalFr ?? "");
  return buildEffectiveLearningHighlights(diff.tokens, learningHighlights);
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
      .map((t) => normalizeLearningWord(t.token))
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
  return [...new Set(words.map((word) => normalizeLearningWord(word)).filter(Boolean))];
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
