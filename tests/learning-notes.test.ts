import { describe, expect, it } from "vitest";

import { generateLearningNotes } from "@/lib/ai/client";

describe("generateLearningNotes", () => {
  it("uses finalized highlight targets for fallback memo generation", async () => {
    const notes = await generateLearningNotes(
      [
        {
          draftFr: "Je vais a la maison.",
          finalFr: "Je vais à la maison.",
          highlights: {
            grammarWords: ["à"],
            knownWords: [],
            unknownWords: [],
          },
        },
        {
          draftFr: "Je vois un truc.",
          finalFr: "Je vois cependant un truc.",
          highlights: {
            grammarWords: [],
            knownWords: [],
            unknownWords: ["cependant"],
          },
        },
      ],
      {
        cefrLevel: "A2",
        grammaticalGender: "neutral",
      },
      {
        language: "ja",
      },
    );

    expect(notes).toEqual([
      "【学び】文法: à",
      "【学び】覚える語: cependant",
    ]);
  });
});
