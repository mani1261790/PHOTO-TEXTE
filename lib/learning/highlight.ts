import { diffWords } from "diff";

import { HighlightSuggestion, suggestHighlightColors } from "@/lib/ai/client";
import { highlightUnknownWords } from "@/lib/cefr/vocab";
import { CEFRLevel } from "@/lib/types";

export type LearningHighlights = {
  knownWords: string[];
  unknownWords: string[];
  grammarWords: string[];
};

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

export function buildLearningHighlights(
  draftFr: string,
  finalFr: string,
  cefrLevel: CEFRLevel,
): LearningHighlights {
  const finalWords = words(finalFr);
  const draftSet = new Set(words(draftFr));

  const unknownSet = new Set(
    highlightUnknownWords(finalFr, cefrLevel)
      .filter((t) => t.unknown)
      .map((t) => normalizeWord(t.token))
      .filter(Boolean),
  );

  const knownSet = new Set<string>();
  for (const w of finalWords) {
    if (draftSet.has(w) && !unknownSet.has(w)) knownSet.add(w);
  }

  const grammarSet = new Set<string>();
  for (const part of diffWords(draftFr ?? "", finalFr ?? "")) {
    if (!part.added) continue;
    for (const w of words(part.value)) {
      if (!knownSet.has(w) && !unknownSet.has(w)) grammarSet.add(w);
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
