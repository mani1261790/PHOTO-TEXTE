import { SupabaseClient } from "@supabase/supabase-js";

import { badRequest, conflict } from "@/lib/api/errors";
import { issueExportToken } from "@/lib/exports/token";
import { buildLearningHighlights } from "@/lib/learning/highlight";
import { generatePhotoTextePptx } from "@/lib/pptx/generator";
import { exportBucket, photoBucket } from "@/lib/storage/buckets";

function normalizeMime(mime: string | null | undefined): string {
  const value = (mime ?? "").trim().toLowerCase();
  if (!value) return "application/octet-stream";
  return value;
}

async function signedPhotoData(
  client: SupabaseClient,
  path: string,
  mime: string | null | undefined,
): Promise<string | undefined> {
  const signed = await client.storage
    .from(photoBucket())
    .createSignedUrl(path, 120);

  if (signed.error || !signed.data?.signedUrl) {
    return undefined;
  }

  const response = await fetch(signed.data.signedUrl);
  if (!response.ok) {
    return undefined;
  }

  const arrayBuffer = await response.arrayBuffer();
  const b64 = Buffer.from(arrayBuffer).toString("base64");

  // IMPORTANT:
  // Do not hardcode image/jpeg here. If the uploaded asset is PNG/WebP/etc,
  // using the wrong MIME can lead to PowerPoint/pptxgenjs decoding quirks,
  // including apparent stretching/distortion.
  const safeMime = normalizeMime(mime);
  return `data:${safeMime};base64,${b64}`;
}

function pickSelfNoteBullets(
  memos: { memo_type: string; content: string }[],
): string[] {
  return (memos ?? [])
    .filter((m) => m.memo_type === "SELF_NOTE")
    .map((m) => m.content ?? "")
    .filter(Boolean);
}

export async function runExportWorkflow(params: {
  client: SupabaseClient;
  userId: string;
  entryId: string;
  includeMemos: boolean;
}) {
  const { client, userId, entryId, includeMemos } = params;

  const entryResult = await client
    .from("entries")
    .select("*")
    .eq("id", entryId)
    .single();

  if (entryResult.error || !entryResult.data) {
    badRequest("ENTRY_NOT_FOUND", "Entry not found");
  }

  const entry = entryResult.data;

  const { data: profile, error: profileError } = await client
    .from("user_profiles")
    .select("display_name,cefr_level")
    .eq("id", userId)
    .single();

  const displayName =
    !profileError && profile?.display_name ? profile.display_name : "";

  // Multi-photo mode: export uses entry_photos (up to 10).
  const { data: entryPhotos, error: entryPhotosError } = await client
    .from("entry_photos")
    .select(
      "id,position,photo_asset_id,draft_fr,jp_auto,jp_intent,final_fr,status,created_at,updated_at",
    )
    .eq("entry_id", entryId)
    .order("position", { ascending: true });

  if (entryPhotosError) {
    badRequest("ENTRY_PHOTOS_LIST_FAILED", "Unable to fetch entry photos");
  }

  const photos = entryPhotos ?? [];

  const hasMultiPhotos = photos.length > 0;

  if (hasMultiPhotos) {
    const notReady = photos.some((p) => !p.final_fr || !p.jp_auto || !p.jp_intent);
    if (notReady) {
      conflict(
        "ENTRY_NOT_READY",
        "All photos must include JP auto/intent and final FR before export",
      );
    }
    const anyNotExportable = photos.some(
      (p) => p.status !== "FINAL_FR_READY" && p.status !== "EXPORTED",
    );
    if (anyNotExportable) {
      conflict(
        "ENTRY_STATUS",
        "One or more photos are not exportable in current status",
      );
    }
  } else {
    // Legacy single-photo mode fallback (pre multi-photo migration).
    if (!entry.final_fr || !entry.jp_auto || !entry.jp_intent) {
      conflict(
        "ENTRY_NOT_READY",
        "Entry must include JP auto/intent and final FR before export",
      );
    }
    if (entry.status !== "FINAL_FR_READY" && entry.status !== "EXPORTED") {
      conflict("ENTRY_STATUS", "Entry is not exportable in current status");
    }
    if (!entry.photo_asset_id) {
      conflict("ENTRY_NOT_READY", "Photo asset is missing");
    }
  }

  // Optional learning bullets (SELF_NOTE only)
  let learningBullets: string[] = [];
  if (includeMemos) {
    const { data: memos, error: memosError } = await client
      .from("memos")
      .select("memo_type,content")
      .eq("entry_id", entryId)
      .eq("user_id", userId);

    if (memosError) {
      badRequest("MEMOS_FETCH_FAILED", "Unable to fetch memos");
    }

    learningBullets = pickSelfNoteBullets(memos ?? []);
  }

  // Resolve assets for all photos
  const assetIds = hasMultiPhotos
    ? photos.map((p) => p.photo_asset_id)
    : [entry.photo_asset_id].filter(Boolean);

  const uniqueAssetIds = [...new Set(assetIds)];

  const { data: assets, error: assetsError } = uniqueAssetIds.length
    ? await client
        .from("assets")
        .select("id,object_path,mime")
        .in("id", uniqueAssetIds)
    : { data: [], error: null };

  if (assetsError) {
    badRequest("ASSET_LIST_FAILED", "Unable to fetch photo assets");
  }

  const assetById = new Map((assets ?? []).map((a) => [a.id, a]));

  // Build pptx input photos
  const pptxPhotos = await Promise.all(
    (hasMultiPhotos
      ? photos
      : [
          {
            position: 1,
            photo_asset_id: entry.photo_asset_id,
            draft_fr: entry.draft_fr,
            jp_auto: entry.jp_auto,
            jp_intent: entry.jp_intent,
            final_fr: entry.final_fr,
          },
        ]
    ).map(async (p: any) => {
      const asset = p.photo_asset_id ? assetById.get(p.photo_asset_id) : null;

      const photoBase64 = asset?.object_path
        ? await signedPhotoData(client, asset.object_path, asset.mime)
        : undefined;

      return {
        ...buildLearningHighlights(
          p.draft_fr ?? "",
          p.final_fr ?? "",
          profile?.cefr_level ?? "A2",
        ),
        position: p.position ?? 1,
        draftFr: p.draft_fr ?? "",
        jpAuto: p.jp_auto ?? "",
        jpIntent: p.jp_intent ?? "",
        finalFr: p.final_fr ?? "",
        photoBase64,
      };
    }),
  );

  const pptxBuffer = await generatePhotoTextePptx({
    titleFr: entry.title_fr,
    displayName,
    photos: pptxPhotos,
    learningBullets,
  });

  const { token, hash } = issueExportToken();
  const objectPath = `${userId}/${entry.id}/${hash}.pptx`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const upload = await client.storage
    .from(exportBucket())
    .upload(objectPath, pptxBuffer, {
      upsert: false,
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
  if (upload.error) {
    badRequest("EXPORT_UPLOAD_FAILED", "Unable to save export file");
  }

  const insert = await client.from("exports").insert({
    user_id: userId,
    entry_id: entry.id,
    token_hash: hash,
    object_path: objectPath,
    expires_at: expiresAt.toISOString(),
  });

  if (insert.error) {
    badRequest("EXPORT_DB_FAILED", "Unable to register export file");
  }

  // Mark as exported:
  // - Multi-photo: mark all photos (if currently FINAL_FR_READY)
  // - Legacy: mark entry
  if (hasMultiPhotos) {
    const photoIdsToUpdate = photos
      .filter((p) => p.status === "FINAL_FR_READY")
      .map((p) => p.id);

    if (photoIdsToUpdate.length) {
      await client
        .from("entry_photos")
        .update({ status: "EXPORTED" })
        .in("id", photoIdsToUpdate);
    }
  } else if (entry.status === "FINAL_FR_READY") {
    await client
      .from("entries")
      .update({ status: "EXPORTED" })
      .eq("id", entry.id);
  }

  return {
    token,
    expires_at: expiresAt.toISOString(),
  };
}
