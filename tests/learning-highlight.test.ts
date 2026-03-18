import { describe, expect, it } from "vitest";

import { buildLearningHighlights } from "@/lib/learning/highlight";

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
});
