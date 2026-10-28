import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError } from '@/lib/api/response';
import { signupSchema } from '@/lib/api/schemas';
import { encryptField, generateDataKey, wrapDataKey } from '@/lib/crypto/envelope';
import { createAuth } from '@/lib/auth/better-auth';
import { createServiceClient } from '@/lib/cloudflare/client';
import { getAppEnv } from '@/lib/cloudflare/context';

export async function POST(req: NextRequest) {
  try {
    const payload = await parseJson(req, signupSchema);
    const auth = await createAuth();
    const response = await auth.api.signUpEmail({
      body: {
        email: payload.email,
        password: payload.password,
        name: payload.display_name?.trim() || payload.email.split('@')[0]
      },
      headers: req.headers,
      asResponse: true
    });

    if (!response.ok) {
      badRequest('SIGNUP_FAILED', 'Unable to create account');
    }

    const signUpResult = await response.json() as { user?: { id?: string } };
    const userId = signUpResult.user?.id;
    if (!userId) badRequest('SIGNUP_FAILED', 'Unable to create account');

    try {
      const dataKey = generateDataKey();
      const wrappedDataKey = wrapDataKey(dataKey);
      const emailEncrypted = encryptField(dataKey, payload.email);

      const service = await createServiceClient();
      const baseProfilePayload = {
        id: userId,
        email_encrypted: emailEncrypted,
        wrapped_data_key: wrappedDataKey,
        display_name: payload.display_name ?? null,
        grammatical_gender: payload.grammatical_gender,
        cefr_level: payload.cefr_level,
        politeness_pref: payload.politeness_pref ?? null
      };

      const { error: profileError } = await service.from('user_profiles').insert(
        {
          ...baseProfilePayload,
          service_language: payload.service_language
        }
      );

      if (profileError) {
        badRequest('PROFILE_CREATE_FAILED', 'Unable to initialize profile');
      }
    } catch (error) {
      const env = await getAppEnv();
      await env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(userId).run();
      throw error;
    }

    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify({
      user_id: userId,
      authenticated: true,
      email_confirmation_required: false
    }), { status: 201, headers });
  } catch (error) {
    return handleApiError(error);
  }
}
