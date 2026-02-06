import { NextRequest } from 'next/server';

import { handleApiError, ok } from '@/lib/api/response';
import { authedClient } from '@/lib/supabase/authed';
import { runRewriteWorkflow } from '@/lib/workflows/rewrite';
import { assertRateLimit } from '@/lib/rate-limit/memory';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user, client } = await authedClient(req);
    assertRateLimit(user.id, 'rewrite', 10, 60_000);

    const updated = await runRewriteWorkflow({
      client,
      userId: user.id,
      entryId: id
    });

    return ok(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
