import { betterAuth } from 'better-auth';

import { getAppEnv, getRuntimeSecret } from '@/lib/cloudflare/context';

export async function createAuth() {
  const env = await getAppEnv();
  const configuredUrl = env.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL;

  return betterAuth({
    database: env.DB,
    secret: getRuntimeSecret(env, 'BETTER_AUTH_SECRET'),
    baseURL: configuredUrl && !configuredUrl.includes('localhost')
      ? configuredUrl
      : {
          allowedHosts: ['localhost', '127.0.0.1', '*.workers.dev'],
          protocol: 'auto'
        },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8
    },
    advanced: {
      database: {
        generateId: 'uuid'
      },
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip']
      },
      useSecureCookies: configuredUrl ? configuredUrl.startsWith('https://') : undefined
    }
  });
}
