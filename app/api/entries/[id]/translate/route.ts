import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { handleApiError, ok } from '@/lib/api/response';
import { translateFrToJa } from '@/lib/ai/client';
import { assertDraftMutable } from '@/lib/entries/state';
import { assertRateLimit } from '@/lib/rate-limit/memory';
import { authedClient } from '@/lib/supabase/authed';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, client } = await authedClient(req);
    assertRateLimit(user.id, 'translate', 10, 60_000);

    const { data: entry, error: entryError } = await client
      .from('entries')
      .select('id,draft_fr,status')
      .eq('id', id)
      .single();

    if (entryError || !entry) {
      badRequest('ENTRY_NOT_FOUND', 'Entry not found');
    }

    assertDraftMutable(entry.status);

    const jpAuto = await translateFrToJa(entry.draft_fr);

    const { data, error } = await client
      .from('entries')
      .update({ jp_auto: jpAuto, status: 'JP_AUTO_READY' })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      badRequest('TRANSLATE_FAILED', 'Unable to translate entry');
    }

    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}
