import { NextRequest, NextResponse } from 'next/server';

import { getAppEnv } from '@/lib/cloudflare/context';
import { verifyStorageSignature } from '@/lib/cloudflare/storage-signature';

const ALLOWED_BUCKETS = new Set(['photos', 'exports']);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bucket: string; path: string[] }> }
) {
  const { bucket, path: segments } = await context.params;
  const path = segments.join('/');
  const expires = Number(request.nextUrl.searchParams.get('expires'));
  const signature = request.nextUrl.searchParams.get('signature') ?? '';

  if (!ALLOWED_BUCKETS.has(bucket) || !path || path.includes('..')) {
    return NextResponse.json({ error: { code: 'INVALID_PATH' } }, { status: 400 });
  }

  const env = await getAppEnv();
  if (!(await verifyStorageSignature(env, bucket, path, expires, signature))) {
    return NextResponse.json({ error: { code: 'INVALID_SIGNATURE' } }, { status: 403 });
  }

  const object = await env.CONTENT_BUCKET.get(`${bucket}/${path}`);
  if (!object) {
    return NextResponse.json({ error: { code: 'OBJECT_NOT_FOUND' } }, { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, max-age=60');
  headers.set('x-content-type-options', 'nosniff');

  return new Response(object.body, { headers });
}
