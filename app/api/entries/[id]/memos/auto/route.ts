import { NextRequest } from 'next/server';

import { generateLearningNotes } from '@/lib/ai/client';
import { badRequest } from '@/lib/api/errors';
import { handleApiError, ok } from '@/lib/api/response';
import {
  buildLearningHighlightsFromDiff,
  buildLearningHighlightsWithAI,
  normalizeLearningHighlights,
} from '@/lib/learning/highlight';
import { assertRateLimit } from '@/lib/rate-limit/memory';
import { authedClient } from '@/lib/supabase/authed';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: entryId } = await context.params;
    const { user, client } = await authedClient(req);
    assertRateLimit(user.id, 'memo_auto', 6, 60_000);

    const [
      { data: entry, error: entryError },
      { data: photos, error: photosError },
      { data: profile, error: profileError }
    ] = await Promise.all([
      client.from('entries').select('*').eq('id', entryId).single(),
      client
        .from('entry_photos')
        .select('draft_fr,final_fr,learning_highlights')
        .eq('entry_id', entryId)
        .order('position', { ascending: true }),
      client
        .from('user_profiles')
        .select('cefr_level,grammatical_gender,politeness_pref,service_language')
        .eq('id', user.id)
        .single()
    ]);

    if (entryError || !entry) {
      badRequest('ENTRY_NOT_FOUND', 'Entry not found');
    }
    if (photosError) {
      badRequest('ENTRY_PHOTOS_LIST_FAILED', 'Unable to fetch entry photos');
    }
    if (profileError || !profile) {
      badRequest('PROFILE_NOT_FOUND', 'Profile not found');
    }

    const pairs =
      photos && photos.length
        ? await Promise.all(photos
            .filter((p) => (p.final_fr ?? '').trim())
            .map(async (p) => {
              const baseHighlights =
                normalizeLearningHighlights(p.learning_highlights) ??
                await buildLearningHighlightsWithAI(
                  p.draft_fr ?? '',
                  p.final_fr ?? '',
                  profile.cefr_level,
                );

              const highlights = buildLearningHighlightsFromDiff(
                p.draft_fr ?? '',
                p.final_fr ?? '',
                baseHighlights,
              );

              return {
              draftFr: p.draft_fr ?? '',
              finalFr: p.final_fr ?? '',
              highlights: {
                grammarWords: highlights.grammarWords,
                knownWords: highlights.knownWords,
                unknownWords: highlights.unknownWords,
              },
            };
            }))
        : entry.final_fr
          ? [await (async () => {
              const baseHighlights =
                normalizeLearningHighlights(entry.learning_highlights) ??
                await buildLearningHighlightsWithAI(
                  entry.draft_fr ?? '',
                  entry.final_fr ?? '',
                  profile.cefr_level,
                );

              const highlights = buildLearningHighlightsFromDiff(
                entry.draft_fr ?? '',
                entry.final_fr ?? '',
                baseHighlights,
              );

              return {
                draftFr: entry.draft_fr ?? '',
                finalFr: entry.final_fr ?? '',
                highlights: {
                  grammarWords: highlights.grammarWords,
                  knownWords: highlights.knownWords,
                  unknownWords: highlights.unknownWords,
                },
              };
            })()]
          : [];

    if (!pairs.length) {
      return ok({ suggestions: [] });
    }

    const unknownWords = [...new Set(
      pairs.flatMap((pair) => pair.highlights?.unknownWords ?? [])
    )];

    const suggestions = await generateLearningNotes(
      pairs,
      {
        cefrLevel: profile.cefr_level,
        grammaticalGender: profile.grammatical_gender,
        politenessPref: profile.politeness_pref
      },
      {
        language: profile.service_language === 'fr' ? 'fr' : 'ja',
        unknownWords
      }
    );

    return ok({ suggestions });
  } catch (error) {
    return handleApiError(error);
  }
}
