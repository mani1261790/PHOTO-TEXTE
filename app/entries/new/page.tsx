'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { apiFetch, apiFetchForm } from '@/lib/api/fetcher';

export default function NewEntryPage() {
  const router = useRouter();
  const [titleFr, setTitleFr] = useState('');
  const [draftFr, setDraftFr] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div>
      <div className="card panel-highlight">
        <h1>新規エントリー作成</h1>
        <p>まずは写真とフランス語下書きを登録します。登録後に翻訳ステップへ進みます。</p>
      </div>
      <div className="card">
        <form onSubmit={onSubmit}>
          <label>
            フランス語タイトル
            <input value={titleFr} onChange={(e) => setTitleFr(e.target.value)} required maxLength={200} />
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
          </label>
          <label>
            写真
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? '作成中...' : '作成して次へ'}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
