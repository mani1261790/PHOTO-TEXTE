import { normalizeLearningWord } from "@/lib/learning/highlight";

function words(text: string): string[] {
  return (text.match(/[A-Za-zÀ-ÿœŒæÆ'’]+/g) ?? [])
    .map((w) => normalizeLearningWord(w))
    .filter(Boolean);
}

export function buildLearnerContextFromTexts(texts: string[]) {
  const sampleTexts = texts.map((text) => (text ?? "").trim()).filter(Boolean);
  const knownWords = [...new Set(sampleTexts.flatMap((text) => words(text)))];

  return {
    knownWords,
    sampleTexts: sampleTexts.slice(0, 12),
  };
}
