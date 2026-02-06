const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY'
] as const;

export function getEnv(name: string, optional = false): string {
  const value = process.env[name];
  if (!value && !optional) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value ?? '';
}

export function validateBaseEnv(): void {
  for (const key of required) {
    getEnv(key);
  }
}
