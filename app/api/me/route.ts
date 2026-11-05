import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { profileLanguageUpdateSchema, profileUpdateSchema } from '@/lib/api/schemas';
import { encryptField, unwrapDataKey } from '@/lib/crypto/envelope';
import { authedClient } from '@/lib/cloudflare/authed';
import { createServiceClient } from '@/lib/cloudflare/client';
import { getAppEnv } from '@/lib/cloudflare/context';

async function deletePrefixObjects(bucket: string, prefix: string): Promise<void> {
  const service = await createServiceClient();
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
      .select('id,display_name,grammatical_gender,cefr_level,politeness_pref,service_language,created_at,updated_at')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      badRequest('PROFILE_NOT_FOUND', 'Profile not found');
    }

    return ok({
      ...data,
      email: user.email
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user, client } = await authedClient(req);
    const payload = await parseJson(req, profileUpdateSchema);
    const updateBody: Record<string, unknown> = {
      display_name: payload.display_name ?? null,
      grammatical_gender: payload.grammatical_gender,
      cefr_level: payload.cefr_level,
      politeness_pref: payload.politeness_pref ?? null,
      service_language: payload.service_language
    };

    let nextEmail: string | undefined;
    if (typeof payload.email === 'string' && payload.email.length && payload.email !== user.email) {
      nextEmail = payload.email;
      const { data: profileForKey, error: keyError } = await client
        .from('user_profiles')
        .select('wrapped_data_key')
        .eq('id', user.id)
        .single();

      if (keyError || !profileForKey) {
        badRequest('PROFILE_NOT_FOUND', 'Profile not found');
      }

      const dataKey = unwrapDataKey(profileForKey.wrapped_data_key);
      updateBody.email_encrypted = encryptField(dataKey, nextEmail);

      const env = await getAppEnv();
      try {
        const existing = await env.DB
          .prepare('SELECT id FROM "user" WHERE lower(email) = lower(?) AND id <> ? LIMIT 1')
          .bind(nextEmail, user.id)
          .first<{ id: string }>();
        if (existing) {
          badRequest('PROFILE_UPDATE_FAILED', 'Unable to update profile');
        }

        const emailUpdate = await env.DB
          .prepare('UPDATE "user" SET email = ?, updatedAt = ? WHERE id = ?')
          .bind(nextEmail, Date.now(), user.id)
          .run();
        if (!emailUpdate.success) {
          badRequest('PROFILE_UPDATE_FAILED', 'Unable to update profile');
        }
      } catch {
        badRequest('PROFILE_UPDATE_FAILED', 'Unable to update profile');
      }
    }

    const { data, error } = await client
      .from('user_profiles')
      .update(updateBody)
      .eq('id', user.id)
      .select('id,display_name,grammatical_gender,cefr_level,politeness_pref,service_language,updated_at')
      .single();

    if (error || !data) {
      if (nextEmail) {
        const env = await getAppEnv();
        await env.DB
          .prepare('UPDATE "user" SET email = ?, updatedAt = ? WHERE id = ?')
          .bind(user.email, Date.now(), user.id)
          .run();
      }
      badRequest('PROFILE_UPDATE_FAILED', 'Unable to update profile');
    }

    return ok({
      ...data,
      email: nextEmail ?? user.email
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user, client } = await authedClient(req);
    const payload = await parseJson(req, profileLanguageUpdateSchema);
    const { data, error } = await client
      .from('user_profiles')
      .update({ service_language: payload.service_language })
      .eq('id', user.id)
      .select('service_language,updated_at')
      .single();

    if (error || !data) {
      badRequest('PROFILE_UPDATE_FAILED', 'Unable to update profile language');
    }

    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user, client } = await authedClient(req);

    await deletePrefixObjects(process.env.PHOTO_BUCKET ?? 'photos', user.id);
    await deletePrefixObjects(process.env.EXPORT_BUCKET ?? 'exports', user.id);

    await client.from('exports').delete();
    await client.from('memos').delete();
    await client.from('entry_photos').delete();
    await client.from('entries').delete();
    await client.from('assets').delete();
    await client.from('user_profiles').delete();

    const env = await getAppEnv();
    await env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(user.id).run();

    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
