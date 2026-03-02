import { NextRequest } from 'next/server';

import { badRequest } from '@/lib/api/errors';
import { parseJson } from '@/lib/api/parse';
import { handleApiError, ok } from '@/lib/api/response';
import { signupSchema } from '@/lib/api/schemas';
import { encryptField, generateDataKey, wrapDataKey } from '@/lib/crypto/envelope';
import { createAnonClient, createServiceClient } from '@/lib/supabase/client';

export async function POST(req: NextRequest) {
  try {
    const payload = await parseJson(req, signupSchema);
    const anon = createAnonClient();

    const signUpResult = await anon.auth.signUp({
      email: payload.email,
      password: payload.password
    });

    if (signUpResult.error || !signUpResult.data.user) {
      badRequest('SIGNUP_FAILED', 'Unable to create account');
    }

    const user = signUpResult.data.user;
    const session = signUpResult.data.session ?? null;
    const dataKey = generateDataKey();
    const wrappedDataKey = wrapDataKey(dataKey);
    const emailEncrypted = encryptField(dataKey, payload.email);

    const service = createServiceClient();
    const baseProfilePayload = {
      id: user.id,
      email_encrypted: emailEncrypted,
      wrapped_data_key: wrappedDataKey,
      display_name: payload.display_name ?? null,
      grammatical_gender: payload.grammatical_gender,
      cefr_level: payload.cefr_level,
      politeness_pref: payload.politeness_pref ?? null
    };

    // NOTE:
    // - Newer schema has `service_language`, older instances may not.
    // - `upsert` keeps signup idempotent when user_profiles row already exists.
    let { error: profileError } = await service.from('user_profiles').upsert(
      {
        ...baseProfilePayload,
        service_language: payload.service_language
      },
      { onConflict: 'id' }
    );

    if (
      profileError &&
      /service_language/i.test(profileError.message) &&
      /(column|schema cache)/i.test(profileError.message)
    ) {
      ({ error: profileError } = await service
        .from('user_profiles')
        .upsert(baseProfilePayload, { onConflict: 'id' }));
    }

    if (profileError) {
      badRequest('PROFILE_CREATE_FAILED', 'Unable to initialize profile');
    }

    return ok({
      user_id: user.id,
      access_token: session?.access_token ?? null,
      refresh_token: session?.refresh_token ?? null,
      email_confirmation_required: session == null
    }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
