import { hashPassword } from 'better-auth/crypto';

import { getAppEnv } from '@/lib/cloudflare/context';

export async function migrateLegacyPassword(email: string, password: string): Promise<boolean> {
  const env = await getAppEnv();
  const url = env.LEGACY_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.LEGACY_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  const user = await env.DB
    .prepare('SELECT id FROM "user" WHERE lower(email) = lower(?) LIMIT 1')
    .bind(email)
    .first<{ id: string }>();
  if (!user?.id) return false;

  const existing = await env.DB
    .prepare("SELECT id FROM account WHERE userId = ? AND providerId = 'credential' LIMIT 1")
    .bind(user.id)
    .first<{ id: string }>();
  if (existing) return false;

  let legacyResponse: Response;
  try {
    legacyResponse = await fetch(`${url.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
  } catch {
    return false;
  }
  if (!legacyResponse.ok) return false;

  const now = Date.now();
  const passwordHash = await hashPassword(password);
  await env.DB
    .prepare(
      'INSERT OR IGNORE INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(crypto.randomUUID(), user.id, 'credential', user.id, passwordHash, now, now)
    .run();
  return true;
}
