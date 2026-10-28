import { afterEach, describe, expect, it, vi } from 'vitest';

const { getAppEnv } = vi.hoisted(() => ({ getAppEnv: vi.fn() }));

vi.mock('@/lib/cloudflare/context', () => ({ getAppEnv }));

import { migrateLegacyPassword } from '@/lib/auth/legacy-supabase';

function mockDatabase(options: { credentialExists: boolean }) {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            first: vi.fn().mockResolvedValue(
              sql.includes('FROM "user"')
                ? { id: 'user-1' }
                : options.credentialExists
                  ? { id: 'account-1' }
                  : null
            )
          };
        }
      };
    }
  };
}

describe('legacy Supabase password migration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    getAppEnv.mockReset();
  });

  it('does not send a password to Supabase after a credential has migrated', async () => {
    getAppEnv.mockResolvedValue({
      DB: mockDatabase({ credentialExists: true }),
      LEGACY_SUPABASE_URL: 'https://legacy.example.test',
      LEGACY_SUPABASE_ANON_KEY: 'anon-key'
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(migrateLegacyPassword('learner@example.test', 'correct-password')).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed when the legacy authentication service is unavailable', async () => {
    getAppEnv.mockResolvedValue({
      DB: mockDatabase({ credentialExists: false }),
      LEGACY_SUPABASE_URL: 'https://legacy.example.test',
      LEGACY_SUPABASE_ANON_KEY: 'anon-key'
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'));

    await expect(migrateLegacyPassword('learner@example.test', 'correct-password')).resolves.toBe(false);
  });
});
