import { NextRequest, NextResponse } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { handleApiError } from '@/lib/api/response';
import { hashExportToken } from '@/lib/exports/token';
import { exportBucket } from '@/lib/storage/buckets';
import { createServiceClient } from '@/lib/supabase/client';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const service = createServiceClient();

    const hash = hashExportToken(token);
    const { data: file, error } = await service
      .from('exports')
      .select('object_path,expires_at')
      .eq('token_hash', hash)
      .single();

    if (error || !file) {
      badRequest('EXPORT_NOT_FOUND', 'Export token not found');
    }

    if (new Date(file.expires_at).getTime() < Date.now()) {
      badRequest('EXPORT_EXPIRED', 'Export token expired');
    }

    const download = await service.storage.from(exportBucket()).download(file.object_path);
    if (download.error || !download.data) {
      badRequest('EXPORT_DOWNLOAD_FAILED', 'Unable to download export');
    }

    const arrayBuffer = await download.data.arrayBuffer();
    return new NextResponse(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': 'attachment; filename="photo-texte-export.pptx"'
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
