import crypto from 'node:crypto';

import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { handleApiError, ok } from '@/lib/api/response';
import { sanitizePhoto } from '@/lib/image/sanitize';
import { assertRateLimit } from '@/lib/rate-limit/memory';
import { photoBucket } from '@/lib/storage/buckets';
import { authedClient } from '@/lib/supabase/authed';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const { user, client } = await authedClient(req);
    assertRateLimit(user.id, 'photo_upload', 30, 60_000);

    const form = await req.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      badRequest('PHOTO_REQUIRED', 'Photo file is required');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      badRequest('PHOTO_TOO_LARGE', 'Photo exceeds max size');
    }

    const raw = Buffer.from(await file.arrayBuffer());
    const sanitized = await sanitizePhoto(raw);

    const assetId = crypto.randomUUID();
    const objectPath = `${user.id}/${assetId}.jpg`;

    const upload = await client.storage
      .from(photoBucket())
      .upload(objectPath, sanitized.buffer, {
        upsert: false,
        contentType: sanitized.mime,
        cacheControl: '31536000'
      });

    if (upload.error) {
      badRequest('PHOTO_UPLOAD_FAILED', 'Unable to upload photo');
    }

    const { data, error } = await client
      .from('assets')
      .insert({
        id: assetId,
        user_id: user.id,
        object_path: objectPath,
        mime: sanitized.mime,
        size: sanitized.size,
        sha256: sanitized.sha256
      })
      .select('*')
      .single();

    if (error || !data) {
      badRequest('ASSET_CREATE_FAILED', 'Unable to register asset');
    }

    return ok({ id: data.id, mime: data.mime, size: data.size, sha256: data.sha256 }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
