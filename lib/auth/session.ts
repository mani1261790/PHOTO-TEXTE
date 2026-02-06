import { NextRequest } from 'next/server';

import { forbidden, notFound } from '@/lib/api/errors';
import { createAnonClient, createServiceClient } from '@/lib/supabase/client';

export interface AuthedUser {
  id: string;
  email: string | null;
  accessToken: string;
}

function readBearer(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth) {
    return null;
  }
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  return auth.slice(7).trim();
}

export async function requireAuth(req: NextRequest): Promise<AuthedUser> {
  const testUser = req.headers.get('x-test-user-id');
  if (process.env.NODE_ENV === 'test' && testUser) {
    return {
      id: testUser,
      email: null,
      accessToken: 'test-token'
    };
  }

  const token = readBearer(req);
  if (!token) {
    forbidden('AUTH_REQUIRED', 'Authentication required');
  }

  const client = createAnonClient(token);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    forbidden('AUTH_INVALID', 'Authentication invalid');
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    accessToken: token
  };
}

export async function requireProfile(userId: string) {
  const client = createServiceClient();
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
