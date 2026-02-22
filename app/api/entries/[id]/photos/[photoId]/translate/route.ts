import { NextRequest } from 'next/server';

import { translateFrToJa } from '@/lib/ai/client';
import { badRequest } from '@/lib/api/errors';
import { handleApiError, ok } from '@/lib/api/response';
import { assertRateLimit } from '@/lib/rate-limit/memory';
import { authedClient } from '@/lib/supabase/authed';

/**
 * POST /api/entries/:id/photos/:photoId/translate
 *
 * Generates jp_auto (automatic Japanese translation) for a specific photo's draft_fr.
 *
 * This mirrors the legacy single-photo endpoint:
 * - Reads entry_photos.draft_fr
 * - Writes entry_photos.jp_auto
 * - Moves entry_photos.status to JP_AUTO_READY
 *
 * Notes:
 * - DB triggers enforce per-photo state transitions/immutability.
 * - We still do a basic ownership + association check for clearer errors.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; photoId: string }> }
) {
  try {
    const { id: entryId, photoId } = await context.params;
    const { user, client } = await authedClient(req);

    assertRateLimit(user.id, 'translate', 10, 60_000);

    const { data: photo, error: photoError } = await client
      .from('entry_photos')
      .select('id,entry_id,user_id,draft_fr,status')
      .eq('id', photoId)
      .single();

    if (photoError || !photo) {
      badRequest('ENTRY_PHOTO_NOT_FOUND', 'Entry photo not found');
    }
    if (photo.entry_id !== entryId || photo.user_id !== user.id) {
      badRequest('ENTRY_PHOTO_NOT_FOUND', 'Entry photo not found');
    }

    // Only allow translation while draft is still mutable on this photo.
    // (Legacy helper asserts against the same status string values.)
    // If you later split entry and photo states, introduce a dedicated helper.
    const { assertDraftMutable } = await import('@/lib/entries/state');
    assertDraftMutable(photo.status as any);

    const jpAuto = await translateFrToJa(photo.draft_fr);

    const { data: updated, error: updateError } = await client
      .from('entry_photos')
      .update({
        jp_auto: jpAuto,
        status: 'JP_AUTO_READY'
      })
      .eq('id', photoId)
      .eq('entry_id', entryId)
      .select(
        'id,entry_id,user_id,position,photo_asset_id,draft_fr,jp_auto,jp_intent,final_fr,status,created_at,updated_at'
      )
      .single();

    if (updateError || !updated) {
      badRequest('TRANSLATE_FAILED', 'Unable to translate entry photo');
    }

    return ok(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
