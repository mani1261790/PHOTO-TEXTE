'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api/fetcher';
import { clearAccessToken } from '@/lib/auth/token-store';

type Profile = {
  email: string | null;
  display_name: string | null;
  grammatical_gender: 'male' | 'female' | 'neutral' | 'auto';
  cefr_level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
};

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<Profile>('/api/me')
      .then(setProfile)
      .catch((err) => setError(err.message));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError(null);

    try {
      const updated = await apiFetch<Profile>('/api/me', {
        method: 'PUT',
        body: JSON.stringify(profile)
      });
      setProfile(updated);
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteAccount() {
    if (!confirm('アカウントと全エントリー・画像・エクスポートを完全に削除します。よろしいですか？')) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/me', { method: 'DELETE' });
      clearAccessToken();
      router.push('/login');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return <div className="card">プロフィールを読み込み中...</div>;
  }

  return (
    <div className="page-stack">
      <div className="card panel-highlight">
        <h1>設定</h1>
        <p>最終フランス語の出力品質に影響する項目です。最初にここを設定してください。</p>
      </div>
      <div className="card form-card">
        <form onSubmit={onSubmit}>
          <label>
            メールアドレス
            <input
              type="email"
              value={profile.email ?? ''}
              onChange={(e) => setProfile({ ...profile, email: e.target.value || null })}
              required
            />
            <span className="field-meta">ログインに使用するメールです。</span>
          </label>
          <label>
            表示名
            <input
              value={profile.display_name ?? ''}
              onChange={(e) => setProfile({ ...profile, display_name: e.target.value || null })}
            />
            <span className="field-meta">任意。提出資料に表示されます。</span>
          </label>
          <label>
            文法上の性
            <select
              value={profile.grammatical_gender}
              onChange={(e) =>
                setProfile({ ...profile, grammatical_gender: e.target.value as Profile['grammatical_gender'] })
              }
            >
              <option value="male">男性</option>
              <option value="female">女性</option>
              <option value="neutral">中性</option>
              <option value="auto">自動</option>
            </select>
            <span className="field-meta">指定しない場合は「自動」がおすすめです。</span>
          </label>
          <label>
            CEFRレベル
            <select
              value={profile.cefr_level}
              onChange={(e) =>
                setProfile({ ...profile, cefr_level: e.target.value as Profile['cefr_level'] })
              }
            >
              <option>A1</option>
              <option>A2</option>
              <option>B1</option>
              <option>B2</option>
              <option>C1</option>
              <option>C2</option>
            </select>
            <span className="field-meta">学習中の目標レベルを選択してください。</span>
          </label>
          <button type="submit" disabled={saving}>
            {saving ? '保存中...' : '設定を保存'}
          </button>
        </form>
        <p className="danger-zone">
          <button type="button" onClick={onDeleteAccount} disabled={saving} className="link-danger">
            アカウントを削除する
          </button>
        </p>
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
