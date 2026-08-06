import { NextRequest } from 'next/server';

import { requireAuth } from '@/lib/auth/session';
import { createUserClient } from '@/lib/cloudflare/client';

export async function authedClient(req: NextRequest) {
  const user = await requireAuth(req);
  const client = await createUserClient(user.id);
  return { user, client };
}
