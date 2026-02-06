'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { setAccessToken } from '@/lib/auth/token-store';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

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
    router.push('/settings');
  }

  return (
    <div>
      <div className="card panel-highlight">
        <h1>{mode === 'login' ? 'ログイン' : '新規登録'}</h1>
        <p>ログイン後は「設定 → 新規エントリー作成」の順で進めるのがおすすめです。</p>
      </div>
      <div className="card">
        <p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          >
            {mode === 'login' ? '新規登録に切り替え' : 'ログインに切り替え'}
          </button>
        </p>
        <form onSubmit={onSubmit}>
          <label>
            メールアドレス
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
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
            />
          </label>
          {mode === 'signup' ? (
            <label>
              表示名（任意）
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
              />
            </label>
          ) : null}
          <button type="submit">{mode === 'login' ? 'ログイン' : 'アカウント作成'}</button>
        </form>
        {error ? <p className="error">{error}</p> : null}
        <p>
          <Link href="/entries">エントリー一覧へ</Link>
        </p>
      </div>
    </div>
  );
}
