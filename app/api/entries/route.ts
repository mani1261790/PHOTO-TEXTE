import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { createEntrySchema } from '@/lib/api/schemas';
import { authedClient } from '@/lib/supabase/authed';

export async function POST(req: NextRequest) {
  try {
    const { user, client } = await authedClient(req);
    const payload = await parseJson(req, createEntrySchema);

    const { data, error } = await client
      .from('entries')
      .insert({
        user_id: user.id,
        title_fr: payload.title_fr,
        draft_fr: payload.draft_fr,
        photo_asset_id: payload.photo_asset_id,
        status: 'DRAFT_FR'
      })
      .select('*')
      .single();

    if (error || !data) {
      badRequest('ENTRY_CREATE_FAILED', 'Unable to create entry');
    }

    return ok(data, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { client } = await authedClient(req);
    const { data, error } = await client
      .from('entries')
      .select('id,title_fr,status,created_at,updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      badRequest('ENTRY_LIST_FAILED', 'Unable to fetch entries');
    }

    return ok({ entries: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
