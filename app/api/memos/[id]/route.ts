import { NextRequest } from 'next/server';

import { handleApiError, ok } from '@/lib/api/response';
import { authedClient } from '@/lib/supabase/authed';

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { client } = await authedClient(req);

    await client.from('memos').delete().eq('id', id);

    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
