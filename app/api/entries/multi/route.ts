import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { createMultiPhotoEntrySchema } from '@/lib/api/schemas';
import { authedClient } from '@/lib/supabase/authed';

/**
 * POST /api/entries/multi
 *
 * Creates a new entry that contains multiple photos (max 10).
 *
 * Payload:
 * {
 *   title_fr: string,
 *   photos: Array<{
 *     photo_asset_id: string (uuid),
 *     draft_fr: string
 *   }>
 * }
 *
 * Notes:
 * - Each photo has its own draft_fr and its own state machine via `entry_photos.status`.
 * - The legacy single-photo entry fields (`entries.draft_fr`, `entries.photo_asset_id`) are not used here.
 * - DB triggers enforce:
 *   - max 10 photos per entry
 *   - state transitions/immutability on entry_photos
 */
export async function POST(req: NextRequest) {
  try {
    const { user, client } = await authedClient(req);
    const payload = await parseJson(req, createMultiPhotoEntrySchema);

    // Defensive: ensure photo_asset_id uniqueness in request to avoid confusing position collisions.
    const ids = payload.photos.map((p) => p.photo_asset_id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      badRequest('DUPLICATE_PHOTO', 'Duplicate photo_asset_id in request');
    }

    // Validate that assets belong to the current user (RLS should enforce, but we want clear errors).
    const { data: assets, error: assetsError } = await client
      .from('assets')
      .select('id,user_id')
      .in('id', ids);

    if (assetsError) {
      badRequest('ASSET_LOOKUP_FAILED', 'Unable to validate photo assets');
    }

    const rows = assets ?? [];
    if (rows.length !== ids.length) {
      badRequest('ASSET_NOT_FOUND', 'One or more photo assets not found');
    }
    if (rows.some((a) => a.user_id !== user.id)) {
      badRequest('ASSET_FORBIDDEN', 'One or more photo assets not owned by user');
    }

    // Create entry first.
    // For multi-photo entries, we store only title + status here.
    // Keep status as DRAFT_FR initially; the per-photo records carry the real workflow status.
    let { data: entry, error: entryError } = await client
      .from('entries')
      .insert({
        user_id: user.id,
        title_fr: payload.title_fr,
        // Legacy fields unused for multi-photo:
        draft_fr: '',
        photo_asset_id: null,
        status: 'DRAFT_FR'
      })
      .select('id,user_id,title_fr,status,created_at,updated_at')
      .single();

    // Backward-compatible fallback:
    // some environments may still have `entries.photo_asset_id NOT NULL`
    // (multi-photo migration not applied yet). In that case we populate
    // legacy single-photo fields with the first photo to keep creation working.
    if (entryError?.code === '23502' && !entry) {
      const firstPhoto = payload.photos[0];
      const retry = await client
        .from('entries')
        .insert({
          user_id: user.id,
          title_fr: payload.title_fr,
          draft_fr: firstPhoto.draft_fr,
          photo_asset_id: firstPhoto.photo_asset_id,
          status: 'DRAFT_FR'
        })
        .select('id,user_id,title_fr,status,created_at,updated_at')
        .single();
      entry = retry.data;
      entryError = retry.error;
    }

    if (entryError || !entry) {
      badRequest('ENTRY_CREATE_FAILED', 'Unable to create entry');
    }

    // Insert per-photo records with deterministic ordering.
    const photoInserts = payload.photos.map((p, index) => ({
      entry_id: entry.id,
      user_id: user.id,
      position: index + 1, // 1..10
      photo_asset_id: p.photo_asset_id,
      draft_fr: p.draft_fr,
      status: 'DRAFT_FR'
    }));

    const { data: createdPhotos, error: photosError } = await client
      .from('entry_photos')
      .insert(photoInserts)
      .select(
        'id,entry_id,user_id,position,photo_asset_id,draft_fr,jp_auto,jp_intent,final_fr,status,created_at,updated_at'
      )
      .order('position', { ascending: true });

    if (photosError || !createdPhotos) {
      // Best effort cleanup: delete the entry (cascades photos if partially inserted).
      // If cleanup fails, it's still safe due to RLS and user-scoped data.
      await client.from('entries').delete().eq('id', entry.id);
      badRequest('ENTRY_PHOTOS_CREATE_FAILED', 'Unable to create entry photos');
    }

    return ok(
      {
        entry,
        photos: createdPhotos
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
