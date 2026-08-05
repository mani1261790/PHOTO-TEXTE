import { NextRequest } from "next/server";

import { badRequest } from "@/lib/api/errors";
import { handleApiError, ok } from "@/lib/api/response";
import { computeReadOnlyDiff } from "@/lib/diff/read-only";
import { authedClient } from "@/lib/supabase/authed";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    const { id: entryId, photoId } = await context.params;
    const { user, client } = await authedClient(req);
    const { data: photo, error: photoError } = await client
      .from("entry_photos")
      .select("id,entry_id,user_id,draft_fr,final_fr")
      .eq("id", photoId)
      .eq("entry_id", entryId)
      .single();

    if (photoError || !photo) {
      badRequest("ENTRY_PHOTO_NOT_FOUND", "Entry photo not found");
    }
    if (photo.user_id !== user.id) {
      badRequest("ENTRY_PHOTO_NOT_FOUND", "Entry photo not found");
    }
    if (!photo.final_fr) {
      badRequest("FINAL_TEXT_REQUIRED", "Final French text not generated yet");
    }

    const diff = computeReadOnlyDiff(photo.draft_fr, photo.final_fr);
    return ok({
      entry_id: entryId,
      photo_id: photoId,
      diff
    });
  } catch (error) {
    return handleApiError(error);
  }
}
