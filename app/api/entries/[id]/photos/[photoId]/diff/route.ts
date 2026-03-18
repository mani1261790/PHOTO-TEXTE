import { NextRequest } from "next/server";

import { badRequest } from "@/lib/api/errors";
import { handleApiError, ok } from "@/lib/api/response";
import { highlightUnknownWords } from "@/lib/cefr/vocab";
import { computeReadOnlyDiff } from "@/lib/diff/read-only";
import {
  buildLearningHighlightsWithAI,
  normalizeLearningHighlights,
} from "@/lib/learning/highlight";
import { authedClient } from "@/lib/supabase/authed";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    const { id: entryId, photoId } = await context.params;
    const { user, client } = await authedClient(req);

    const [
      { data: photo, error: photoError },
      { data: profile, error: profileError },
    ] = await Promise.all([
      client
        .from("entry_photos")
        .select("id,entry_id,user_id,draft_fr,final_fr,learning_highlights")
        .eq("id", photoId)
        .eq("entry_id", entryId)
        .single(),
      client
        .from("user_profiles")
        .select("cefr_level")
        .eq("id", user.id)
        .single(),
    ]);

    if (photoError || !photo) {
      badRequest("ENTRY_PHOTO_NOT_FOUND", "Entry photo not found");
    }
    if (photo.user_id !== user.id) {
      badRequest("ENTRY_PHOTO_NOT_FOUND", "Entry photo not found");
    }
    if (profileError || !profile) {
      badRequest("PROFILE_NOT_FOUND", "Profile not found");
    }
    if (!photo.final_fr) {
      badRequest("FINAL_TEXT_REQUIRED", "Final French text not generated yet");
    }

    const diff = computeReadOnlyDiff(photo.draft_fr, photo.final_fr);
    const learningHighlights =
      normalizeLearningHighlights(photo.learning_highlights) ??
      await buildLearningHighlightsWithAI(
        photo.draft_fr ?? "",
        photo.final_fr ?? "",
        profile.cefr_level,
      );

    return ok({
      entry_id: entryId,
      photo_id: photoId,
      diff,
      learning_highlights: learningHighlights,
      draft_highlights: highlightUnknownWords(
        photo.draft_fr,
        profile.cefr_level,
      ),
      final_highlights: highlightUnknownWords(
        photo.final_fr,
        profile.cefr_level,
      ),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
