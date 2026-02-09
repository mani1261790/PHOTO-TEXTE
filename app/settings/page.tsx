'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api/fetcher';
import { clearAccessToken } from '@/lib/auth/token-store';
import { serviceLanguageLabels } from '@/lib/i18n';
import { useLanguage } from '@/components/LanguageProvider';

type Profile = {
  email: string;
  display_name: string | null;
  grammatical_gender: 'male' | 'female' | 'neutral' | 'auto';
  cefr_level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  service_language: 'ja' | 'fr';
};

export default function SettingsPage() {
  const router = useRouter();
  const { language, setLanguage } = useLanguage();
  const t = (ja: string, fr: string) => (language === 'fr' ? fr : ja);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<Profile>('/api/me')
      .then((data) => setProfile({ ...data, email: data.email ?? '' }))
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
    if (
      !confirm(
        t(
          'アカウントと全エントリー・画像・エクスポートを完全に削除します。よろしいですか？',
          'Le compte, toutes les entrées, images et exports seront supprimés. Continuer ?'
        )
      )
    ) {
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
    return <div className="card">{t('プロフィールを読み込み中...', 'Chargement du profil...')}</div>;
  }

  return (
    <div className="page-stack">
      <div className="card panel-highlight">
        <h1>{t('設定', 'Paramètres')}</h1>
        <p>
          {t(
            '最終フランス語の出力品質に影響する項目です。最初にここを設定してください。',
            'Ces options influencent la qualité du français final. Commencez par les régler.'
          )}
        </p>
      </div>
      <div className="card form-card">
        <form onSubmit={onSubmit}>
          <label>
            {t('メールアドレス', 'Adresse e-mail')}
            <input
              type="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              required
            />
            <span className="field-meta">
              {t('ログインに使用するメールです。', 'Utilisée pour vous connecter.')}
            </span>
          </label>
          <label>
            {t('表示名', 'Nom affiché')}
            <input
              value={profile.display_name ?? ''}
              onChange={(e) => setProfile({ ...profile, display_name: e.target.value || null })}
            />
            <span className="field-meta">
              {t('任意。提出資料に表示されます。', 'Optionnel. Affiché sur les documents remis.')}
            </span>
          </label>
          <label>
            {t('文法上の性', 'Genre grammatical')}
            <select
              value={profile.grammatical_gender}
              onChange={(e) =>
                setProfile({ ...profile, grammatical_gender: e.target.value as Profile['grammatical_gender'] })
              }
            >
              <option value="male">{t('男性', 'Masculin')}</option>
              <option value="female">{t('女性', 'Féminin')}</option>
              <option value="neutral">{t('中性', 'Neutre')}</option>
              <option value="auto">{t('自動', 'Auto')}</option>
            </select>
            <span className="field-meta">
              {t('指定しない場合は「自動」がおすすめです。', 'Choisissez “Auto” si vous hésitez.')}
            </span>
          </label>
          <label>
            {t('CEFRレベル', 'Niveau CECR')}
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
            <span className="field-meta">
              {t('学習中の目標レベルを選択してください。', 'Choisissez votre niveau cible.')}
            </span>
          </label>
          <label>
            {t('サービスの言語', 'Langue du service')}
            <select
              value={profile.service_language}
              onChange={(e) => {
                const next = e.target.value as Profile['service_language'];
                setProfile({ ...profile, service_language: next });
                setLanguage(next);
              }}
            >
              <option value="ja">{serviceLanguageLabels.ja}</option>
              <option value="fr">{serviceLanguageLabels.fr}</option>
            </select>
            <span className="field-meta">
              {t('画面表示の言語を切り替えます。', "Change la langue de l'interface.")}
            </span>
          </label>
          <button type="submit" disabled={saving}>
            {saving ? t('保存中...', 'Enregistrement...') : t('設定を保存', 'Enregistrer')}
          </button>
        </form>
        <p className="danger-zone">
          <button type="button" onClick={onDeleteAccount} disabled={saving} className="link-danger">
            {t('アカウントを削除する', 'Supprimer le compte')}
          </button>
        </p>
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
