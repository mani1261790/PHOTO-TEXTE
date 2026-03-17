import { diffWords } from "diff";

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
