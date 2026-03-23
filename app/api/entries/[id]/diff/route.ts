import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { handleApiError, ok } from '@/lib/api/response';
import { highlightUnknownWords } from '@/lib/cefr/vocab';
import { computeReadOnlyDiff } from '@/lib/diff/read-only';
import { buildLearnerContextFromTexts } from '@/lib/learning/context';
import {
  buildLearningHighlightsWithAI,
  normalizeLearningHighlights,
} from '@/lib/learning/highlight';
import { authedClient } from '@/lib/supabase/authed';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, client } = await authedClient(req);
    const refresh = req.nextUrl.searchParams.get("refresh") === "1";

    const [{ data: entry, error: entryError }, { data: profile, error: profileError }, { data: learnerPhotos, error: learnerPhotosError }] =
      await Promise.all([
        client.from('entries').select('*').eq('id', id).single(),
        client.from('user_profiles').select('cefr_level').eq('id', user.id).single(),
        client
          .from('entry_photos')
          .select('draft_fr,final_fr')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(30)
      ]);

    if (entryError || !entry) {
      badRequest('ENTRY_NOT_FOUND', 'Entry not found');
    }
    if (profileError || !profile) {
      badRequest('PROFILE_NOT_FOUND', 'Profile not found');
    }
    if (learnerPhotosError) {
      badRequest('ENTRY_PHOTOS_LIST_FAILED', 'Unable to fetch learner context');
    }
    if (!entry.final_fr) {
      badRequest('FINAL_TEXT_REQUIRED', 'Final French text not generated yet');
    }

    const diff = computeReadOnlyDiff(entry.draft_fr, entry.final_fr);
    const learnerContext = buildLearnerContextFromTexts([
      ...(learnerPhotos ?? []).flatMap((row) => [row.draft_fr ?? '', row.final_fr ?? '']),
      entry.draft_fr ?? '',
      entry.final_fr ?? '',
    ]);
    const learningHighlights =
      (!refresh ? normalizeLearningHighlights(entry.learning_highlights) : null) ??
      await buildLearningHighlightsWithAI(
        entry.draft_fr ?? '',
        entry.final_fr ?? '',
        profile.cefr_level,
        learnerContext,
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
