import { describe, expect, it } from "vitest";

import { computeReadOnlyDiff } from "@/lib/diff/read-only";
import {
  buildLearningHighlights,
  buildLearningHighlightsFromDiff,
  getLearningTokenSignature,
} from "@/lib/learning/highlight";

describe("buildLearningHighlights", () => {
  it("highlights grammar corrections separately from lexical corrections", () => {
    const result = buildLearningHighlights(
      "Je pense a la photo.",
      "Je pense à la maison.",
      "A2",
    );

    expect(result.grammarWords).toEqual(["à"]);
    expect(result.knownWords).toEqual(["maison"]);
    expect(result.unknownWords).toEqual([]);
  });

  it("uses the CEFR level to flag corrected unknown words", () => {
    const result = buildLearningHighlights(
      "Je pense a la maison.",
      "Je pense à cependant la maison.",
      "A2",
    );

    expect(result.grammarWords).toEqual(["à"]);
    expect(result.knownWords).toEqual([]);
    expect(result.unknownWords).toEqual(["cependant"]);
  });

  it("does not mark unchanged known words as correction highlights", () => {
    const result = buildLearningHighlights(
      "Je vais a la maison.",
      "Je vais à la maison.",
      "A2",
    );

    expect(result.grammarWords).toEqual(["à"]);
    expect(result.knownWords).toEqual([]);
    expect(result.unknownWords).toEqual([]);
  });

  it("reapplies saved per-token overrides when the diff signature matches", () => {
    const draft = "Je vais a la maison.";
    const final = "Je vais à la maison à Paris.";
    const diff = computeReadOnlyDiff(draft, final);

    const result = buildLearningHighlightsFromDiff(
      draft,
      final,
      {
        knownWords: [],
        unknownWords: [],
        grammarWords: ["à"],
        tokenSignature: getLearningTokenSignature(diff.tokens),
        wordClassByKey: {
          "2-0": "unknown",
        },
      },
    );

    expect(result.unknownWords).toEqual(["à"]);
    expect(result.grammarWords).toEqual([]);
    expect(result.wordClassByKey).toEqual({ "2-0": "unknown" });
  });

  it("preserves explicit none overrides instead of falling back to the default highlight", () => {
    const draft = "Je vais a la maison.";
    const final = "Je vais à la maison.";
    const diff = computeReadOnlyDiff(draft, final);

    const result = buildLearningHighlightsFromDiff(
      draft,
      final,
      {
        knownWords: [],
        unknownWords: [],
        grammarWords: ["à"],
        tokenSignature: getLearningTokenSignature(diff.tokens),
        wordClassByKey: {
          "2-0": "none",
        },
      },
    );

    expect(result.grammarWords).toEqual([]);
    expect(result.knownWords).toEqual([]);
    expect(result.unknownWords).toEqual([]);
    expect(result.wordClassByKey).toEqual({ "2-0": "none" });
  });

  it("does not auto-highlight added words when no learning target was selected", () => {
    const draft = "Je vais a la maison.";
    const final = "Je vais à la maison.";

    const result = buildLearningHighlightsFromDiff(
      draft,
      final,
      {
        knownWords: [],
        unknownWords: [],
        grammarWords: [],
      },
    );

    expect(result.grammarWords).toEqual([]);
    expect(result.knownWords).toEqual([]);
    expect(result.unknownWords).toEqual([]);
  });
});
