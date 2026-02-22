import { NextRequest } from 'next/server';

import { rewriteJaToFr } from '@/lib/ai/client';
import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { lockIntentSchema } from '@/lib/api/schemas';
import { assertRateLimit } from '@/lib/rate-limit/memory';
import { authedClient } from '@/lib/supabase/authed';

/**
 * POST /api/entries/:id/photos/:photoId/lock_intent
 *
 * Per-photo intent lock:
 * - Saves jp_intent for the specified entry photo
 * - Generates final_fr via LLM (rewrite ja -> fr)
 * - Advances the per-photo state machine:
 *     JP_AUTO_READY -> JP_INTENT_LOCKED  (writes jp_intent + final_fr)
 *     JP_INTENT_LOCKED -> FINAL_FR_READY (finalize; no content changes)
 *
 * Notes:
 * - DB triggers enforce immutability (jp_intent set-once, etc.) and valid transitions.
 * - This endpoint mirrors the legacy single-photo lock workflow semantics.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; photoId: string }> }
) {
  try {
    const { id: entryId, photoId } = await context.params;
    const { user, client } = await authedClient(req);

    assertRateLimit(user.id, 'rewrite', 10, 60_000);

    const payload = await parseJson(req, lockIntentSchema);

    const [{ data: photo, error: photoError }, { data: profile, error: profileError }] =
      await Promise.all([
        client
          .from('entry_photos')
          .select('id,entry_id,user_id,status,jp_intent,final_fr')
          .eq('id', photoId)
          .single(),
        client
          .from('user_profiles')
          .select('cefr_level,grammatical_gender,politeness_pref')
          .eq('id', user.id)
          .single()
      ]);

    if (photoError || !photo) {
      badRequest('ENTRY_PHOTO_NOT_FOUND', 'Entry photo not found');
    }
    if (photo.entry_id !== entryId || photo.user_id !== user.id) {
      badRequest('ENTRY_PHOTO_NOT_FOUND', 'Entry photo not found');
    }
    if (profileError || !profile) {
      badRequest('PROFILE_NOT_FOUND', 'Profile not found');
    }

    // Validate the photo status is in a state where locking intent makes sense.
    // We keep the logic close to the legacy flow:
    // - If JP_AUTO_READY: lock intent and generate final_fr, move to JP_INTENT_LOCKED
    // - If JP_INTENT_LOCKED and final_fr already exists: finalize by moving to FINAL_FR_READY
    // - Otherwise: reject
    if (photo.status !== 'JP_AUTO_READY' && photo.status !== 'JP_INTENT_LOCKED') {
      badRequest('ENTRY_PHOTO_STATUS', 'Entry photo is not intent-lockable in current status');
    }

    if (photo.status === 'JP_INTENT_LOCKED') {
      // Already locked. If final_fr exists, allow a "finalize" operation (no content changes).
      if (!photo.final_fr) {
        badRequest('REWRITE_FAILED', 'Final French text not generated yet');
      }

      const { data: finalized, error: finalizeError } = await client
        .from('entry_photos')
        .update({
          status: 'FINAL_FR_READY'
        })
        .eq('id', photoId)
        .eq('entry_id', entryId)
        .select(
          'id,entry_id,user_id,position,photo_asset_id,draft_fr,jp_auto,jp_intent,final_fr,status,created_at,updated_at'
        )
        .single();

      if (finalizeError || !finalized) {
        badRequest('REWRITE_FAILED', 'Unable to finalize rewritten text');
      }

      return ok(finalized);
    }

    // photo.status === 'JP_AUTO_READY'
    let finalFr: string;
    try {
      finalFr = await rewriteJaToFr(payload.jp_intent, {
        cefrLevel: profile.cefr_level,
        grammaticalGender: profile.grammatical_gender,
        politenessPref: profile.politeness_pref
      });
    } catch {
      badRequest('REWRITE_FAILED', 'Unable to rewrite text');
    }

    if (!finalFr.trim()) {
      badRequest('REWRITE_FAILED', 'Generated text is empty');
    }

    // Lock intent + store final FR. DB triggers enforce jp_intent set-once.
    const { data: locked, error: lockError } = await client
      .from('entry_photos')
      .update({
        jp_intent: payload.jp_intent,
        final_fr: finalFr,
        status: 'JP_INTENT_LOCKED'
      })
      .eq('id', photoId)
      .eq('entry_id', entryId)
      .select(
        'id,entry_id,user_id,position,photo_asset_id,draft_fr,jp_auto,jp_intent,final_fr,status,created_at,updated_at'
      )
      .single();

    if (lockError || !locked) {
      badRequest('REWRITE_FAILED', 'Unable to lock intent for entry photo');
    }

    // Finalize status to FINAL_FR_READY, matching the legacy flow's two-step lock/finalize.
    const { data: finalized, error: finalizeError } = await client
      .from('entry_photos')
      .update({
        status: 'FINAL_FR_READY'
      })
      .eq('id', photoId)
      .eq('entry_id', entryId)
      .select(
        'id,entry_id,user_id,position,photo_asset_id,draft_fr,jp_auto,jp_intent,final_fr,status,created_at,updated_at'
      )
      .single();

    if (finalizeError || !finalized) {
      badRequest('REWRITE_FAILED', 'Unable to finalize rewritten text');
    }

    return ok(finalized);
  } catch (error) {
    return handleApiError(error);
  }
}
