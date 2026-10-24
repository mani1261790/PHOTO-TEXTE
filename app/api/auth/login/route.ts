import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError } from '@/lib/api/response';
import { loginSchema } from '@/lib/api/schemas';
import { createAuth } from '@/lib/auth/better-auth';
import { migrateLegacyPassword } from '@/lib/auth/legacy-supabase';

export async function POST(req: NextRequest) {
  try {
    const payload = await parseJson(req, loginSchema);
    const auth = await createAuth();
    const signIn = () => auth.api.signInEmail({
      body: {
        email: payload.email,
        password: payload.password
      },
      headers: req.headers,
      asResponse: true
    });
    let response = await signIn();

    if (!response.ok && await migrateLegacyPassword(payload.email, payload.password)) {
      response = await signIn();
    }

    if (!response.ok) {
      badRequest('LOGIN_FAILED', 'Unable to authenticate');
    }

    const result = await response.json() as { user?: { id?: string } };
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify({
      user_id: result.user?.id ?? null,
      authenticated: true
    }), { status: 200, headers });
  } catch (error) {
    return handleApiError(error);
  }
}
