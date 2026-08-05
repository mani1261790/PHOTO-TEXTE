import { describe, expect, it } from "vitest";

import { generateLearningNotes } from "@/lib/ai/client";

describe("generateLearningNotes", () => {
  it("does not recreate automatic highlight classifications as a fallback", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const notes = await generateLearningNotes(
        [{
          draftFr: "Je vais a la maison.",
          finalFr: "Je vais à la maison.",
        }],
        {
          cefrLevel: "A2",
          grammaticalGender: "neutral",
        },
        {
          language: "ja",
        },
      );

      expect(notes).toEqual([]);
    } finally {
      if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    }
  });
});
