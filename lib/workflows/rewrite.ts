import { SupabaseClient } from '@supabase/supabase-js';

import { rewriteJaToFr } from '@/lib/ai/client';
import { badRequest } from '@/lib/api/errors';
import { assertRewritable } from '@/lib/entries/state';

export async function runRewriteWorkflow(params: {
  client: SupabaseClient;
  userId: string;
  entryId: string;
}) {
  const { client, userId, entryId } = params;

  const [{ data: entry, error: entryError }, { data: profile, error: profileError }] =
    await Promise.all([
      client.from('entries').select('*').eq('id', entryId).single(),
      client
        .from('user_profiles')
        .select('cefr_level,grammatical_gender,politeness_pref')
        .eq('id', userId)
        .single()
    ]);

  if (entryError || !entry) {
    badRequest('ENTRY_NOT_FOUND', 'Entry not found');
  }
  if (profileError || !profile) {
    badRequest('PROFILE_NOT_FOUND', 'Profile not found');
  }

  assertRewritable(entry.status);
  if (!entry.jp_intent) {
    badRequest('MISSING_INTENT', 'Intent text not found');
  }

  const finalFr = await rewriteJaToFr(entry.jp_intent, {
    cefrLevel: profile.cefr_level,
    grammaticalGender: profile.grammatical_gender,
    politenessPref: profile.politeness_pref
  });

  const { data, error } = await client
    .from('entries')
    .update({
      final_fr: finalFr,
      status: 'FINAL_FR_READY'
    })
    .eq('id', entryId)
    .select('*')
    .single();

  if (error || !data) {
    badRequest('REWRITE_FAILED', 'Unable to rewrite text');
  }

  return data;
}
