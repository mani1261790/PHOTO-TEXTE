import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { createMemoSchema } from '@/lib/api/schemas';
import { authedClient } from '@/lib/supabase/authed';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { client } = await authedClient(req);

    const { data, error } = await client
      .from('memos')
      .select('*')
      .eq('entry_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      badRequest('MEMO_LIST_FAILED', 'Unable to fetch memos');
    }

    return ok({ memos: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, client } = await authedClient(req);
    const payload = await parseJson(req, createMemoSchema);

    const { data: entry } = await client.from('entries').select('id').eq('id', id).single();
    if (!entry) {
      badRequest('ENTRY_NOT_FOUND', 'Entry not found');
    }

    const { data, error } = await client
      .from('memos')
      .insert({
        entry_id: id,
        user_id: user.id,
        memo_type: payload.memo_type,
        content: payload.content
      })
      .select('*')
      .single();

    if (error || !data) {
      badRequest('MEMO_CREATE_FAILED', 'Unable to create memo');
    }

    return ok(data, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
