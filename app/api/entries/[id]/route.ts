import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { updateEntrySchema } from '@/lib/api/schemas';
import { assertDraftMutable } from '@/lib/entries/state';
import { exportBucket, photoBucket } from '@/lib/storage/buckets';
import { authedClient } from '@/lib/supabase/authed';
import { createServiceClient } from '@/lib/supabase/client';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { client } = await authedClient(req);

    const { data, error } = await client.from('entries').select('*').eq('id', id).single();
    if (error || !data) {
      badRequest('ENTRY_NOT_FOUND', 'Entry not found');
    }

    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { client } = await authedClient(req);
    const payload = await parseJson(req, updateEntrySchema);

    const { data: entry, error: entryError } = await client
      .from('entries')
      .select('*')
      .eq('id', id)
      .single();
    if (entryError || !entry) {
      badRequest('ENTRY_NOT_FOUND', 'Entry not found');
    }

    assertDraftMutable(entry.status);

    const update: Record<string, string> = {};
    if (payload.title_fr !== undefined) {
      update.title_fr = payload.title_fr;
    }
    if (payload.draft_fr !== undefined) {
      update.draft_fr = payload.draft_fr;
    }
    if (payload.photo_asset_id !== undefined) {
      update.photo_asset_id = payload.photo_asset_id;
    }

    if (!Object.keys(update).length) {
      badRequest('NO_FIELDS', 'No updatable fields provided');
    }

    const { data, error } = await client
      .from('entries')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      badRequest('ENTRY_UPDATE_FAILED', 'Unable to update entry');
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
    const { client } = await authedClient(req);
    const service = createServiceClient();

    const { data: entry, error: entryError } = await client
      .from('entries')
      .select('id,photo_asset_id')
      .eq('id', id)
      .single();

    if (entryError || !entry) {
      badRequest('ENTRY_NOT_FOUND', 'Entry not found');
    }

    const [{ data: asset }, { data: exports }] = await Promise.all([
      client
        .from('assets')
        .select('object_path')
        .eq('id', entry.photo_asset_id)
        .single(),
      client.from('exports').select('object_path').eq('entry_id', entry.id)
    ]);

    await client.from('entries').delete().eq('id', id);

    if (asset?.object_path) {
      await service.storage.from(photoBucket()).remove([asset.object_path]);
    }

    if (exports?.length) {
      await service.storage
        .from(exportBucket())
        .remove(exports.map((item) => item.object_path));
    }

    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
