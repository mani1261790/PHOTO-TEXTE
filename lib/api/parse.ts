import { NextRequest } from 'next/server';
import { ZodSchema } from 'zod';

import { badRequest } from '@/lib/api/errors';

export async function parseJson<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<T> {
  const json = await req.json().catch(() => null);
  if (!json) {
    badRequest('INVALID_JSON', 'Invalid JSON body');
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    badRequest('VALIDATION_ERROR', 'Invalid request payload');
  }

  return result.data;
}
