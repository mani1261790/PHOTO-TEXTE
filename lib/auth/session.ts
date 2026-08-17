import { NextRequest } from 'next/server';

import { forbidden, notFound } from '@/lib/api/errors';
import { createAuth } from '@/lib/auth/better-auth';
import { createServiceClient } from '@/lib/cloudflare/client';

export interface AuthedUser {
  id: string;
  email: string | null;
}

export async function requireAuth(req: NextRequest): Promise<AuthedUser> {
  const testUser = req.headers.get('x-test-user-id');
  if (process.env.NODE_ENV === 'test' && testUser) {
    return {
      id: testUser,
      email: null
    };
  }

  const auth = await createAuth();
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    forbidden('AUTH_INVALID', 'Authentication invalid');
  }

  return {
    id: session.user.id,
    email: session.user.email ?? null
  };
}

export async function requireProfile(userId: string) {
  const client = await createServiceClient();
  const { data, error } = await client
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    notFound('PROFILE_NOT_FOUND', 'Profile not found');
  }

  return data;
}
