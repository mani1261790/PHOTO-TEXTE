import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { handleApiError, ok } from '@/lib/api/response';
import { highlightUnknownWords } from '@/lib/cefr/vocab';
import { computeReadOnlyDiff } from '@/lib/diff/read-only';
import { buildLearningHighlightsWithAI } from '@/lib/learning/highlight';
import { authedClient } from '@/lib/supabase/authed';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, client } = await authedClient(req);

    const [{ data: entry, error: entryError }, { data: profile, error: profileError }] =
      await Promise.all([
        client.from('entries').select('*').eq('id', id).single(),
        client.from('user_profiles').select('cefr_level').eq('id', user.id).single()
      ]);

    if (entryError || !entry) {
      badRequest('ENTRY_NOT_FOUND', 'Entry not found');
    }
    if (profileError || !profile) {
      badRequest('PROFILE_NOT_FOUND', 'Profile not found');
    }
    if (!entry.final_fr) {
      badRequest('FINAL_TEXT_REQUIRED', 'Final French text not generated yet');
    }

    const diff = computeReadOnlyDiff(entry.draft_fr, entry.final_fr);
    const learningHighlights = await buildLearningHighlightsWithAI(
      entry.draft_fr ?? '',
      entry.final_fr ?? '',
      profile.cefr_level
    );

    return ok({
      entry_id: entry.id,
      diff,
      learning_highlights: learningHighlights,
      draft_highlights: highlightUnknownWords(entry.draft_fr, profile.cefr_level),
      final_highlights: highlightUnknownWords(entry.final_fr, profile.cefr_level)
    });
  } catch (error) {
    return handleApiError(error);
  }
}
