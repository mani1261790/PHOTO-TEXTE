import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { lockIntentSchema } from '@/lib/api/schemas';
import { assertIntentLockable } from '@/lib/entries/state';
import { authedClient } from '@/lib/supabase/authed';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { client } = await authedClient(req);
    const payload = await parseJson(req, lockIntentSchema);

    const { data: entry, error: entryError } = await client
      .from('entries')
      .select('id,status,jp_intent')
      .eq('id', id)
      .single();

    if (entryError || !entry) {
      badRequest('ENTRY_NOT_FOUND', 'Entry not found');
    }

    assertIntentLockable(entry.status);

    const { data, error } = await client
      .from('entries')
      .update({
        jp_intent: payload.jp_intent,
        status: 'JP_INTENT_LOCKED'
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      badRequest('LOCK_FAILED', 'Unable to lock intent');
    }

    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}
