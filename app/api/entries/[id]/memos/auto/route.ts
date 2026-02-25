import { NextRequest } from 'next/server';

import { generateLearningNotes } from '@/lib/ai/client';
import { badRequest } from '@/lib/api/errors';
import { handleApiError, ok } from '@/lib/api/response';
import { highlightUnknownWords } from '@/lib/cefr/vocab';
import { assertRateLimit } from '@/lib/rate-limit/memory';
import { authedClient } from '@/lib/supabase/authed';
import { CEFRLevel } from '@/lib/types';

function collectUnknownWords(texts: string[], level: CEFRLevel): string[] {
  const words = new Map<string, string>();
  for (const text of texts) {
    const tokens = highlightUnknownWords(text, level);
    for (const token of tokens) {
      if (!token.unknown || !token.lemma || !token.meaning) continue;
      if (!words.has(token.lemma)) {
        words.set(token.lemma, token.meaning);
      }
    }
  }
  return [...words.entries()].map(([lemma, meaning]) => `${lemma} (${meaning})`);
}

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
        .select('draft_fr,final_fr')
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
        ? photos
            .filter((p) => (p.final_fr ?? '').trim())
            .map((p) => ({
              draftFr: p.draft_fr ?? '',
              finalFr: p.final_fr ?? ''
            }))
        : entry.final_fr
          ? [
              {
                draftFr: entry.draft_fr ?? '',
                finalFr: entry.final_fr ?? ''
              }
            ]
          : [];

    if (!pairs.length) {
      return ok({ suggestions: [] });
    }

    const unknownWords = collectUnknownWords(
      pairs.map((p) => p.finalFr),
      profile.cefr_level
    );

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
