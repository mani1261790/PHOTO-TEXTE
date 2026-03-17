import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { authedClient } from '@/lib/supabase/authed';
import { z } from 'zod';

const updateMemoSchema = z.object({
  content: z.string().min(1).max(4000)
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, client } = await authedClient(req);
    const payload = await parseJson(req, updateMemoSchema);

    const { data, error } = await client
      .from('memos')
      .update({ content: payload.content })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error || !data) {
      badRequest('MEMO_UPDATE_FAILED', 'Unable to update memo');
    }

    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, client } = await authedClient(req);

    await client.from('memos').delete().eq('id', id).eq('user_id', user.id);

    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
