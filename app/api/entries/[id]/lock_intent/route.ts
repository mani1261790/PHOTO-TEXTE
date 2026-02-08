import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { rewriteJaToFr } from '@/lib/ai/client';
import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { lockIntentSchema } from '@/lib/api/schemas';
import { assertIntentLockable } from '@/lib/entries/state';
import { assertRateLimit } from '@/lib/rate-limit/memory';
import { authedClient } from '@/lib/supabase/authed';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, client } = await authedClient(req);
    assertRateLimit(user.id, 'rewrite', 10, 60_000);
    const payload = await parseJson(req, lockIntentSchema);

    const [{ data: entry, error: entryError }, { data: profile, error: profileError }] =
      await Promise.all([
        client
          .from('entries')
          .select('id,status,jp_intent')
          .eq('id', id)
          .single(),
        client
          .from('user_profiles')
          .select('cefr_level,grammatical_gender,politeness_pref')
          .eq('id', user.id)
          .single()
      ]);

    if (entryError || !entry) {
      badRequest('ENTRY_NOT_FOUND', 'Entry not found');
    }
    if (profileError || !profile) {
      badRequest('PROFILE_NOT_FOUND', 'Profile not found');
    }

    assertIntentLockable(entry.status);

    let finalFr = '';
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

    const { data: locked, error: lockError } = await client
      .from('entries')
      .update({
        jp_intent: payload.jp_intent,
        final_fr: finalFr,
        status: 'JP_INTENT_LOCKED'
      })
      .eq('id', id)
      .select('*')
      .single();

    if (lockError || !locked) {
      badRequest('LOCK_FAILED', 'Unable to lock intent');
    }

    const { data: finalized, error: finalizeError } = await client
      .from('entries')
      .update({
        status: 'FINAL_FR_READY'
      })
      .eq('id', id)
      .select('*')
      .single();

    if (finalizeError || !finalized) {
      badRequest('REWRITE_FAILED', 'Unable to finalize rewritten text');
    }

    return ok(finalized);
  } catch (error) {
    return handleApiError(error);
  }
}
