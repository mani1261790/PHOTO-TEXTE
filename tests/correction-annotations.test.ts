import { describe, expect, it } from "vitest";

import {
  addKnownRange,
  buildCorrectionAnnotationSegments,
  emptyCorrectionAnnotations,
  normalizeCorrectionAnnotations,
  removeKnownRange,
  replaceHighlightRange,
} from "@/lib/learning/annotations";

describe("manual correction annotations", () => {
  it("keeps highlight colors mutually exclusive while preserving surrounding ranges", () => {
    const first = replaceHighlightRange([], { start: 0, end: 12 }, "useful_word");
    const second = replaceHighlightRange(first, { start: 3, end: 8 }, "useful_verb");

    expect(second).toEqual([
      { start: 0, end: 3, kind: "useful_word" },
      { start: 3, end: 8, kind: "useful_verb" },
      { start: 8, end: 12, kind: "useful_word" },
    ]);
  });

  it("stores known ranges independently from highlight colors", () => {
    const text = "Je connais ce mot.";
    const annotations = emptyCorrectionAnnotations(text);
    annotations.highlights = replaceHighlightRange(
      annotations.highlights,
      { start: 3, end: 11 },
      "useful_verb",
    );
    annotations.knownRanges = addKnownRange([], { start: 0, end: 11 });

    const segments = buildCorrectionAnnotationSegments(text, annotations);
    expect(segments.some((segment) => segment.known && segment.highlight === "useful_verb")).toBe(true);
    expect(segments.some((segment) => segment.known && segment.highlight === null)).toBe(true);
  });

  it("splits an outlined range when only its middle is removed", () => {
    expect(removeKnownRange([{ start: 0, end: 15 }], { start: 4, end: 10 })).toEqual([
      { start: 0, end: 4 },
      { start: 10, end: 15 },
    ]);
  });

  it("drops stale and legacy annotations when the final text changes", () => {
    const original = "Je visite Paris.";
    const annotations = emptyCorrectionAnnotations(original);
    annotations.highlights = [{ start: 3, end: 9, kind: "useful_verb" }];

    expect(normalizeCorrectionAnnotations(annotations, "Je découvre Paris.").highlights).toEqual([]);
    expect(
      normalizeCorrectionAnnotations(
        { knownWords: ["visite"], grammarWords: [], unknownWords: [] },
        original,
      ).highlights,
    ).toEqual([]);
  });
});
