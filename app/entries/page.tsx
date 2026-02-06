'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api/fetcher';

type EntryItem = {
  id: string;
  title_fr: string;
  status: string;
  updated_at: string;
};

export default function EntriesPage() {
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const statusLabel: Record<string, string> = {
    DRAFT_FR: '下書き作成中',
    JP_AUTO_READY: 'JP自動翻訳完了',
    JP_INTENT_LOCKED: '意図JPロック済み',
    FINAL_FR_READY: '最終FR生成完了',
    EXPORTED: 'エクスポート済み'
  };

  useEffect(() => {
    apiFetch<{ entries: EntryItem[] }>('/api/entries')
      .then((res) => setEntries(res.entries))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="card panel-highlight">
        <div className="section-head">
          <h1>エントリー一覧</h1>
        </div>
        <p>未完了のエントリーを開いて、続きから作業できます。</p>
        <div className="actions-row">
          <Link href="/entries/new" className="badge">
            新規エントリー作成
          </Link>
          <Link href="/settings" className="badge">
            設定
          </Link>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="entry-list">
        {entries.map((entry) => (
          <div key={entry.id} className="card">
            <div className="section-head">
              <h3>{entry.title_fr}</h3>
              <span className="badge">{statusLabel[entry.status] ?? entry.status}</span>
            </div>
            <p>更新日時: {new Date(entry.updated_at).toLocaleString()}</p>
            <div className="actions-row">
              <Link href={`/entries/${entry.id}`} className="badge">
                続きを開く
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
