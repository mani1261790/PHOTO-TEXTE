import { NextRequest } from 'next/server';

import { requireAuth } from '@/lib/auth/session';
import { createAnonClient } from '@/lib/supabase/client';

export async function authedClient(req: NextRequest) {
  const user = await requireAuth(req);
  const client = createAnonClient(user.accessToken);
  return { user, client };
}
