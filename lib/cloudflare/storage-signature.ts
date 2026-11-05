import { AppEnv, getRuntimeSecret } from '@/lib/cloudflare/context';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmac(env: AppEnv, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getRuntimeSecret(env, 'STORAGE_SIGNING_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(signature));
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function issueStorageSignature(
  env: AppEnv,
  bucket: string,
  path: string,
  expires: number
): Promise<string> {
  return hmac(env, `${bucket}\n${path}\n${expires}`);
}

export async function verifyStorageSignature(
  env: AppEnv,
  bucket: string,
  path: string,
  expires: number,
  signature: string
): Promise<boolean> {
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const expected = await issueStorageSignature(env, bucket, path, expires);
  return safeEqual(expected, signature);
}
