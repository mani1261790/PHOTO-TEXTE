'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

import { apiFetch, apiFetchForm } from '@/lib/api/fetcher';
import { getAccessToken } from '@/lib/auth/token-store';

export default function NewEntryPage() {
  const router = useRouter();
  const [titleFr, setTitleFr] = useState('');
  const [draftFr, setDraftFr] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('写真を選択してください。');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const form = new FormData();
      form.append('file', file);
      const asset = await apiFetchForm<{ id: string }>('/api/assets/photo', form);

      const entry = await apiFetch<{ id: string }>('/api/entries', {
        method: 'POST',
        body: JSON.stringify({
          title_fr: titleFr,
          draft_fr: draftFr,
          photo_asset_id: asset.id
        })
      });

      router.push(`/entries/${entry.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(file && titleFr.trim() && draftFr.trim()) && !busy;
  const titleCount = titleFr.length;
  const draftCount = draftFr.length;

  return (
    <div className="page-stack">
      <div className="card panel-highlight">
        <h1>新規エントリー作成</h1>
        <p>写真・タイトル・下書き本文を入力すると、次のステップ（日本語文の確認）へ進めます。</p>
        <p className="info-chip">所要時間の目安: 2〜4分</p>
      </div>
      <div className="card form-card">
        <div className="section-head">
          <h3>入力項目</h3>
          <span className="badge">{canSubmit ? '入力完了' : '入力中'}</span>
        </div>
        <form onSubmit={onSubmit}>
          <label>
            フランス語タイトル
            <input value={titleFr} onChange={(e) => setTitleFr(e.target.value)} required maxLength={200} />
            <span className="field-meta">{titleCount} / 200</span>
          </label>
          <label>
            フランス語ドラフト
            <textarea
              value={draftFr}
              onChange={(e) => setDraftFr(e.target.value)}
              rows={8}
              required
              maxLength={8000}
              placeholder="例: 今日、私は学校の帰り道で夕焼けを見た。"
            />
            <span className="field-meta">{draftCount} / 8000</span>
          </label>
          <label>
            写真
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
            {file ? (
              <span className="field-meta">
                選択中: {file.name}（{Math.ceil(file.size / 1024)}KB）
              </span>
            ) : (
              <span className="field-meta">JPG/PNG/HEICなどの画像を選択できます。</span>
            )}
          </label>
          <button type="submit" disabled={!canSubmit}>
            {busy ? '作成中...' : '作成して次へ'}
          </button>
          <p className="timeline-detail">作成後は自動で詳細画面に移動します。</p>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
