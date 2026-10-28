import { NextRequest } from 'next/server';

import { createAuth } from '@/lib/auth/better-auth';

async function handler(request: NextRequest): Promise<Response> {
  const auth = await createAuth();
  return auth.handler(request);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
