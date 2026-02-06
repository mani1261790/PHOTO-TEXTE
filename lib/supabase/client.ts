import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { getEnv } from '@/lib/env';

export function createAnonClient(accessToken?: string): SupabaseClient {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anon = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return createClient(url, anon, {
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      : undefined,
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function createServiceClient(): SupabaseClient {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRole = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
