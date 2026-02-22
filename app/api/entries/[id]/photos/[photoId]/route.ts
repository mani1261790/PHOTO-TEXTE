import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { updateEntryPhotoSchema } from '@/lib/api/schemas';
import { authedClient } from '@/lib/supabase/authed';

/**
 * PATCH /api/entries/:id/photos/:photoId
 *
 * Updates a specific entry photo record (multi-photo support).
 *
 * Notes:
 * - This endpoint is intentionally "thin": it validates input and performs the update.
 * - State transitions and immutability rules are enforced at the DB layer via triggers.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; photoId: string }> }
) {
  try {
    const { id: entryId, photoId } = await context.params;
    const { user, client } = await authedClient(req);

    const payload = await parseJson(req, updateEntryPhotoSchema);

    // Build update object with only provided fields.
    // (If you need to set something to NULL, pass explicit null in payload.)
    const update: Record<string, unknown> = {};
    if (payload.draft_fr !== undefined) update.draft_fr = payload.draft_fr;
    if (payload.jp_auto !== undefined) update.jp_auto = payload.jp_auto;
    if (payload.jp_intent !== undefined) update.jp_intent = payload.jp_intent;
    if (payload.final_fr !== undefined) update.final_fr = payload.final_fr;

    if (Object.keys(update).length === 0) {
      badRequest('NO_FIELDS', 'No fields to update');
    }

    // Ensure the photo belongs to the entry and user (RLS should also enforce this).
    const { data: existing, error: existingError } = await client
      .from('entry_photos')
      .select('id,entry_id,user_id')
      .eq('id', photoId)
      .single();

    if (existingError || !existing) {
      badRequest('ENTRY_PHOTO_NOT_FOUND', 'Entry photo not found');
    }
    if (existing.entry_id !== entryId || existing.user_id !== user.id) {
      badRequest('ENTRY_PHOTO_NOT_FOUND', 'Entry photo not found');
    }

    const { data, error } = await client
      .from('entry_photos')
      .update(update)
      .eq('id', photoId)
      .eq('entry_id', entryId)
      .select(
        'id,entry_id,user_id,position,photo_asset_id,draft_fr,jp_auto,jp_intent,final_fr,status,created_at,updated_at'
      )
      .single();

    if (error || !data) {
      // DB triggers can throw for invalid transitions/immutability.
      badRequest('ENTRY_PHOTO_UPDATE_FAILED', 'Unable to update entry photo');
    }

    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/entries/:id/photos/:photoId
 *
 * Fetch a specific photo record (useful for focused editors).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; photoId: string }> }
) {
  try {
    const { id: entryId, photoId } = await context.params;
    const { user, client } = await authedClient(req);

    const { data, error } = await client
      .from('entry_photos')
      .select(
        'id,entry_id,user_id,position,photo_asset_id,draft_fr,jp_auto,jp_intent,final_fr,status,created_at,updated_at'
      )
      .eq('id', photoId)
      .eq('entry_id', entryId)
      .single();

    if (error || !data) {
      badRequest('ENTRY_PHOTO_NOT_FOUND', 'Entry photo not found');
    }
    if (data.user_id !== user.id) {
      badRequest('ENTRY_PHOTO_NOT_FOUND', 'Entry photo not found');
    }

    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}
