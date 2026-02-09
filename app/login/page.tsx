'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';

import { apiFetch } from '@/lib/api/fetcher';
import { setAccessToken } from '@/lib/auth/token-store';
import { useLanguage } from '@/components/LanguageProvider';

type ProfileCheck = {
  created_at: string | null;
  updated_at: string | null;
};

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === 'fr' ? fr : ja);
  const [mode, setMode] = useState<'login' | 'signup'>(
    searchParams.get('mode') === 'signup' ? 'signup' : 'login'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(nextMode: 'login' | 'signup') {
    setMode(nextMode);
    router.replace(nextMode === 'signup' ? '/login?mode=signup' : '/login');
  }

  async function routeAfterLogin() {
    try {
      const profile = await apiFetch<ProfileCheck>('/api/me');
      const hasConfigured = Boolean(
        profile?.created_at && profile?.updated_at && profile.created_at !== profile.updated_at
      );
      router.push(hasConfigured ? '/' : '/settings');
    } catch (err) {
      router.push('/settings');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
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
        setError(json?.error?.message ?? t('認証に失敗しました。', "Échec de l'authentification."));
        return;
      }

      if (!json.access_token) {
        if (mode === 'signup') {
          setNotice(
            t(
              '確認メールを送信しました。メール内のリンクで確認を完了した後、この画面でログインしてください。',
              "E-mail de confirmation envoyé. Ouvrez le lien, puis connectez-vous ici."
            )
          );
          switchMode('login');
          return;
        }

        setError(
          t(
            'アクセストークンを取得できませんでした。しばらくしてから再度お試しください。',
            "Impossible d'obtenir le jeton. Réessayez plus tard."
          )
        );
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
        <h1>{t('はじめる', 'Commencer')}</h1>
        <p>
          {t(
            'ログイン後は「設定 → 新規エントリー作成」の順で進めるとスムーズです。',
            "Après connexion, suivez « Paramètres → Nouvelle entrée »."
          )}
        </p>
      </div>
      <div className="card">
        <div className="auth-switch">
          <button
            type="button"
            className={mode === 'login' ? '' : 'btn-secondary'}
            onClick={() => {
              setError(null);
              setNotice(null);
              switchMode('login');
            }}
            disabled={busy}
          >
            {t('ログイン', 'Connexion')}
          </button>
          <button
            type="button"
            className={mode === 'signup' ? '' : 'btn-secondary'}
            onClick={() => {
              setError(null);
              setNotice(null);
              switchMode('signup');
            }}
            disabled={busy}
          >
            {t('新規登録', 'Créer un compte')}
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <label>
            {t('メールアドレス', 'Adresse e-mail')}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label>
            {t('パスワード', 'Mot de passe')}
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
              {t('表示名（任意）', 'Nom affiché (optionnel)')}
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                disabled={busy}
              />
            </label>
          ) : null}
          <button type="submit" disabled={busy}>
            {busy
              ? t('処理中...', 'Traitement...')
              : mode === 'login'
                ? t('ログイン', 'Connexion')
                : t('アカウント作成', 'Créer un compte')}
          </button>
        </form>
        {notice ? <p className="info-chip">{notice}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="page-stack" />}>
      <LoginContent />
    </Suspense>
  );
}
