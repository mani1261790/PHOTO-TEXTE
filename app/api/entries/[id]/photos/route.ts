import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { handleApiError, ok } from '@/lib/api/response';
import { authedClient } from '@/lib/supabase/authed';

/**
 * GET /api/entries/:id/photos
 *
 * Lists photos belonging to an entry (multi-photo support), including signed preview URLs.
 *
 * Response shape:
 * {
 *   entry_id: string,
 *   photos: Array<{
 *     id: string,
 *     entry_id: string,
 *     user_id: string,
 *     position: number,
 *     photo_asset_id: string,
 *     draft_fr: string,
 *     jp_auto: string | null,
 *     jp_intent: string | null,
 *     final_fr: string | null,
 *     status: 'DRAFT_FR'|'JP_AUTO_READY'|'JP_INTENT_LOCKED'|'FINAL_FR_READY'|'EXPORTED',
 *     created_at: string,
 *     updated_at: string,
 *     photo_preview_url: string | null
 *   }>
 * }
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: entryId } = await context.params;
    const { user, client } = await authedClient(req);

    // Ensure the entry exists and belongs to the current user.
    const { data: entry, error: entryError } = await client
      .from('entries')
      .select('id,user_id')
      .eq('id', entryId)
      .single();

    if (entryError || !entry) {
      badRequest('ENTRY_NOT_FOUND', 'Entry not found');
    }
    if (entry.user_id !== user.id) {
      // RLS should already protect this, but keep behavior explicit.
      badRequest('ENTRY_NOT_FOUND', 'Entry not found');
    }

    const { data: photos, error: photosError } = await client
      .from('entry_photos')
      .select(
        'id,entry_id,user_id,position,photo_asset_id,draft_fr,jp_auto,jp_intent,final_fr,learning_highlights,status,created_at,updated_at'
      )
      .eq('entry_id', entryId)
      .order('position', { ascending: true });

    if (photosError) {
      badRequest('ENTRY_PHOTOS_LIST_FAILED', 'Unable to fetch entry photos');
    }

    const rows = photos ?? [];
    const assetIds = [...new Set(rows.map((p) => p.photo_asset_id))];

    const { data: assets, error: assetsError } = assetIds.length
      ? await client.from('assets').select('id,object_path,mime').in('id', assetIds)
      : { data: [] as { id: string; object_path: string; mime: string }[], error: null };

    if (assetsError) {
      badRequest('ASSET_LIST_FAILED', 'Unable to fetch photo assets');
    }

    const assetById = new Map((assets ?? []).map((a) => [a.id, a]));

    const bucket = process.env.PHOTO_BUCKET ?? 'photos';

    const photosWithPreview = await Promise.all(
      rows.map(async (p) => {
        const asset = assetById.get(p.photo_asset_id);
        let photo_preview_url: string | null = null;

        if (asset?.object_path) {
          // Short-lived preview URL for UI display.
          const signed = await client.storage.from(bucket).createSignedUrl(asset.object_path, 300);
          if (!signed.error && signed.data?.signedUrl) {
            photo_preview_url = signed.data.signedUrl;
          }
        }

        return {
          ...p,
          photo_preview_url,
        };
      })
    );

    return ok({ entry_id: entryId, photos: photosWithPreview });
  } catch (error) {
    return handleApiError(error);
  }
}
