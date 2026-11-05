import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { handleApiError, ok } from '@/lib/api/response';
import { computeReadOnlyDiff } from '@/lib/diff/read-only';
import { authedClient } from '@/lib/cloudflare/authed';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, client } = await authedClient(req);
    const { data: entry, error: entryError } = await client
      .from('entries')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (entryError || !entry) {
      badRequest('ENTRY_NOT_FOUND', 'Entry not found');
    }
    if (!entry.final_fr) {
      badRequest('FINAL_TEXT_REQUIRED', 'Final French text not generated yet');
    }

    const diff = computeReadOnlyDiff(entry.draft_fr, entry.final_fr);
    return ok({
      entry_id: entry.id,
      diff
    });
  } catch (error) {
    return handleApiError(error);
  }
}
