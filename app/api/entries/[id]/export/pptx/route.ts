import { NextRequest } from 'next/server';

import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { exportSchema } from '@/lib/api/schemas';
import { assertRateLimit } from '@/lib/rate-limit/memory';
import { authedClient } from '@/lib/supabase/authed';
import { runExportWorkflow } from '@/lib/workflows/export';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, client } = await authedClient(req);
    assertRateLimit(user.id, 'pptx_export', 12, 60_000);

    const payload = await parseJson(req, exportSchema);

    const result = await runExportWorkflow({
      client,
      userId: user.id,
      entryId: id,
      includeMemos: Boolean(payload.include_memos)
    });

    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
