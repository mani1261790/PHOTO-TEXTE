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
      .select('id,title_fr,status,photo_asset_id,final_fr,created_at,updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      badRequest('ENTRY_LIST_FAILED', 'Unable to fetch entries');
    }

    const entries = data ?? [];
    const assetIds = [...new Set(entries.map((entry) => entry.photo_asset_id))];
    const { data: assets } = assetIds.length
      ? await client
          .from('assets')
          .select('id,object_path')
          .in('id', assetIds)
      : { data: [] as { id: string; object_path: string }[] };

    const assetPathById = new Map((assets ?? []).map((asset) => [asset.id, asset.object_path]));

    const entriesWithPreview = await Promise.all(
      entries.map(async (entry) => {
        const objectPath = assetPathById.get(entry.photo_asset_id);
        let photo_preview_url: string | null = null;

        if (objectPath) {
          const signed = await client.storage.from(process.env.PHOTO_BUCKET ?? 'photos').createSignedUrl(objectPath, 300);
          if (!signed.error && signed.data?.signedUrl) {
            photo_preview_url = signed.data.signedUrl;
          }
        }

        return {
          ...entry,
          photo_preview_url
        };
      })
    );

    return ok({ entries: entriesWithPreview });
  } catch (error) {
    return handleApiError(error);
  }
}
