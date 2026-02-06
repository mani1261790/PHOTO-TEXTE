import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { profileUpdateSchema } from '@/lib/api/schemas';
import { authedClient } from '@/lib/supabase/authed';
import { createServiceClient } from '@/lib/supabase/client';

async function deletePrefixObjects(bucket: string, prefix: string): Promise<void> {
  const service = createServiceClient();
  const list = await service.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' }
  });
  if (list.error || !list.data?.length) {
    return;
  }

  const paths = list.data.map((item) => `${prefix}/${item.name}`);
  await service.storage.from(bucket).remove(paths);
}

export async function GET(req: NextRequest) {
  try {
    const { user, client } = await authedClient(req);
    const { data, error } = await client
      .from('user_profiles')
      .select('id,display_name,grammatical_gender,cefr_level,politeness_pref,created_at,updated_at')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      badRequest('PROFILE_NOT_FOUND', 'Profile not found');
    }

    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user, client } = await authedClient(req);
    const payload = await parseJson(req, profileUpdateSchema);

    const { data, error } = await client
      .from('user_profiles')
      .update({
        display_name: payload.display_name ?? null,
        grammatical_gender: payload.grammatical_gender,
        cefr_level: payload.cefr_level,
        politeness_pref: payload.politeness_pref ?? null
      })
      .eq('id', user.id)
      .select('id,display_name,grammatical_gender,cefr_level,politeness_pref,updated_at')
      .single();

    if (error || !data) {
      badRequest('PROFILE_UPDATE_FAILED', 'Unable to update profile');
    }

    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user, client } = await authedClient(req);
    const service = createServiceClient();

    await deletePrefixObjects(process.env.PHOTO_BUCKET ?? 'photos', user.id);
    await deletePrefixObjects(process.env.EXPORT_BUCKET ?? 'exports', user.id);

    await client.rpc('delete_my_account');
    await service.auth.admin.deleteUser(user.id);

    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
