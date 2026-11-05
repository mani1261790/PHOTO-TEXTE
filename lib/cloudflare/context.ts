import { getCloudflareContext } from '@opennextjs/cloudflare';

export interface AppEnv {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
  ASSETS: Fetcher;
  WORKER_SELF_REFERENCE: Fetcher;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET?: string;
  STORAGE_SIGNING_SECRET?: string;
  APP_MASTER_KEY_B64?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  PHOTO_BUCKET?: string;
  EXPORT_BUCKET?: string;
  LEGACY_SUPABASE_URL?: string;
  LEGACY_SUPABASE_ANON_KEY?: string;
}

export async function getAppEnv(): Promise<AppEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as AppEnv;
}

export function getRuntimeSecret(env: AppEnv, name: 'BETTER_AUTH_SECRET' | 'STORAGE_SIGNING_SECRET'): string {
  const value = env[name] ?? process.env[name];
  if (value) return value;

  if (process.env.NODE_ENV !== 'production') {
    return `photo-texte-local-${name.toLowerCase()}-only`;
  }

  throw new Error(`Missing Cloudflare secret: ${name}`);
}
