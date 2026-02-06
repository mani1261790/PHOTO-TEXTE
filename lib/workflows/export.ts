import { SupabaseClient } from '@supabase/supabase-js';

import { badRequest, conflict } from '@/lib/api/errors';
import { highlightUnknownWords } from '@/lib/cefr/vocab';
import { issueExportToken } from '@/lib/exports/token';
import { generatePhotoTextePptx } from '@/lib/pptx/generator';
import { exportBucket, photoBucket } from '@/lib/storage/buckets';

async function signedPhotoData(
  client: SupabaseClient,
  path: string
): Promise<string | undefined> {
  const signed = await client.storage.from(photoBucket()).createSignedUrl(path, 120);

  if (signed.error || !signed.data?.signedUrl) {
    return undefined;
  }

  const response = await fetch(signed.data.signedUrl);
  if (!response.ok) {
    return undefined;
  }

  const arrayBuffer = await response.arrayBuffer();
  const b64 = Buffer.from(arrayBuffer).toString('base64');
  return `data:image/jpeg;base64,${b64}`;
}

export async function runExportWorkflow(params: {
  client: SupabaseClient;
  userId: string;
  entryId: string;
  includeMemos: boolean;
}) {
  const { client, userId, entryId, includeMemos } = params;

  const [entryResult, profileResult] = await Promise.all([
    client.from('entries').select('*').eq('id', entryId).single(),
    client.from('user_profiles').select('cefr_level').eq('id', userId).single()
  ]);

  if (entryResult.error || !entryResult.data) {
    badRequest('ENTRY_NOT_FOUND', 'Entry not found');
  }

  const entry = entryResult.data;
  if (!entry.final_fr || !entry.jp_auto) {
    conflict('ENTRY_NOT_READY', 'Entry must be fully generated before export');
  }
  if (entry.status !== 'FINAL_FR_READY' && entry.status !== 'EXPORTED') {
    conflict('ENTRY_STATUS', 'Entry is not exportable in current status');
  }

  const { data: asset } = await client
    .from('assets')
    .select('object_path')
    .eq('id', entry.photo_asset_id)
    .single();

  const memosPromise = includeMemos
    ? client.from('memos').select('*').eq('entry_id', entry.id).order('created_at', { ascending: true })
    : Promise.resolve({ data: [] as any[] });

  const [photoBase64, memosResult] = await Promise.all([
    asset?.object_path ? signedPhotoData(client, asset.object_path) : Promise.resolve(undefined),
    memosPromise
  ]);

  const cefr = profileResult.data?.cefr_level ?? 'A2';

  const pptxBuffer = await generatePhotoTextePptx({
    titleFr: entry.title_fr,
    draftFr: entry.draft_fr,
    jpText: entry.jp_intent ?? entry.jp_auto,
    finalFr: entry.final_fr,
    photoBase64,
    draftHighlights: highlightUnknownWords(entry.draft_fr, cefr),
    finalHighlights: highlightUnknownWords(entry.final_fr, cefr),
    memos: memosResult.data ?? [],
    includeMemos
  });

  const { token, hash } = issueExportToken();
  const objectPath = `${userId}/${entry.id}/${hash}.pptx`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const upload = await client.storage.from(exportBucket()).upload(objectPath, pptxBuffer, {
    upsert: false,
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  });
  if (upload.error) {
    badRequest('EXPORT_UPLOAD_FAILED', 'Unable to save export file');
  }

  const insert = await client.from('exports').insert({
    user_id: userId,
    entry_id: entry.id,
    token_hash: hash,
    object_path: objectPath,
    expires_at: expiresAt.toISOString()
  });

  if (insert.error) {
    badRequest('EXPORT_DB_FAILED', 'Unable to register export file');
  }

  if (entry.status === 'FINAL_FR_READY') {
    await client.from('entries').update({ status: 'EXPORTED' }).eq('id', entry.id);
  }

  return {
    token,
    expires_at: expiresAt.toISOString()
  };
}
