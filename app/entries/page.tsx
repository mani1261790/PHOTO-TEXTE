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
      <div className="card">
        <h1>エントリー一覧</h1>
        <p>
          <Link href="/entries/new">新規エントリー作成</Link> | <Link href="/settings">設定</Link>
        </p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {entries.map((entry) => (
        <div key={entry.id} className="card">
          <h3>{entry.title_fr}</h3>
          <p>
            <span className="badge">{statusLabel[entry.status] ?? entry.status}</span>
          </p>
          <p>更新日時: {new Date(entry.updated_at).toLocaleString()}</p>
          <Link href={`/entries/${entry.id}`}>開く</Link>
        </div>
      ))}
    </div>
  );
}
