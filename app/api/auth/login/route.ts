import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { loginSchema } from '@/lib/api/schemas';
import { createAnonClient } from '@/lib/supabase/client';

export async function POST(req: NextRequest) {
  try {
    const payload = await parseJson(req, loginSchema);
    const anon = createAnonClient();

    const result = await anon.auth.signInWithPassword({
      email: payload.email,
      password: payload.password
    });

    if (result.error || !result.data.user || !result.data.session) {
      badRequest('LOGIN_FAILED', 'Unable to authenticate');
    }

    return ok({
      user_id: result.data.user.id,
      access_token: result.data.session.access_token,
      refresh_token: result.data.session.refresh_token
    });
  } catch (error) {
    return handleApiError(error);
  }
}
