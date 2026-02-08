'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { apiFetch } from '@/lib/api/fetcher';
import { setAccessToken } from '@/lib/auth/token-store';

type ProfileCheck = {
  created_at: string | null;
  updated_at: string | null;
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function routeAfterLogin() {
    try {
      const profile = await apiFetch<ProfileCheck>('/api/me');
      const hasConfigured = Boolean(
        profile?.created_at && profile?.updated_at && profile.created_at !== profile.updated_at
      );
      router.push(hasConfigured ? '/entries' : '/settings');
    } catch (err) {
      router.push('/settings');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const body: Record<string, unknown> = { email, password };

      if (mode === 'signup') {
        body.display_name = displayName || undefined;
        body.grammatical_gender = 'auto';
        body.cefr_level = 'A2';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(json?.error?.message ?? '認証に失敗しました。');
        return;
      }

      if (!json.access_token) {
        setError('アクセストークンを取得できませんでした。メール確認設定を確認してください。');
        return;
      }

      setAccessToken(json.access_token);
      await routeAfterLogin();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="card panel-highlight">
        <h1>はじめる</h1>
        <p>ログイン後は「設定 → 新規エントリー作成」の順で進めるとスムーズです。</p>
      </div>
      <div className="card">
        <div className="auth-switch">
          <button
            type="button"
            className={mode === 'login' ? '' : 'btn-secondary'}
            onClick={() => setMode('login')}
            disabled={busy}
          >
            ログイン
          </button>
          <button
            type="button"
            className={mode === 'signup' ? '' : 'btn-secondary'}
            onClick={() => setMode('signup')}
            disabled={busy}
          >
            新規登録
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <label>
            メールアドレス
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label>
            パスワード
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              disabled={busy}
            />
          </label>
          {mode === 'signup' ? (
            <label>
              表示名（任意）
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                disabled={busy}
              />
            </label>
          ) : null}
          <button type="submit" disabled={busy}>
            {busy ? '処理中...' : mode === 'login' ? 'ログイン' : 'アカウント作成'}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
