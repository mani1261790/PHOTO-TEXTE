import { forbidden } from '@/lib/api/errors';

type Bucket = {
  resetAt: number;
  count: number;
};

const buckets = new Map<string, Bucket>();

export function assertRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowMs: number
): void {
  const now = Date.now();
  const key = `${userId}:${action}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt < now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return;
  }

  if (existing.count >= limit) {
    forbidden('RATE_LIMITED', 'Too many requests');
  }

  existing.count += 1;
}
