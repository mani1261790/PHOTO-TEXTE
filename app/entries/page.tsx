'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api/fetcher';
import { getAccessToken } from '@/lib/auth/token-store';

type EntryItem = {
  id: string;
  title_fr: string;
  status: string;
  final_fr: string | null;
  photo_preview_url: string | null;
  updated_at: string;
};

const inProgress = new Set(['DRAFT_FR', 'JP_AUTO_READY', 'JP_INTENT_LOCKED']);
const done = new Set(['FINAL_FR_READY', 'EXPORTED']);

export default function EntriesPage() {
  const router = useRouter();
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
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }

    apiFetch<{ entries: EntryItem[] }>('/api/entries')
      .then((res) => setEntries(res.entries))
      .catch((err) => setError(err.message));
  }, [router]);

  const inProgressEntries = useMemo(
    () => entries.filter((entry) => inProgress.has(entry.status)),
    [entries]
  );

  const doneEntries = useMemo(
    () => entries.filter((entry) => done.has(entry.status)),
    [entries]
  );

  function renderEntry(entry: EntryItem) {
    return (
      <details key={entry.id} className="card accordion-card">
        <summary className="accordion-head">
          <div>
            <strong>{entry.title_fr}</strong>
            <div className="timeline-detail">更新日時: {new Date(entry.updated_at).toLocaleString()}</div>
          </div>
          <span className="badge">{statusLabel[entry.status] ?? entry.status}</span>
        </summary>

        <div className="accordion-body">
          {entry.photo_preview_url ? (
            <img
              src={entry.photo_preview_url}
              alt={entry.title_fr}
              className="entry-thumb"
              loading="lazy"
            />
          ) : null}

          <div>
            <h4>最終フランス語</h4>
            <p>{entry.final_fr ?? 'まだ最終文は生成されていません。'}</p>
            <div className="actions-row">
              <Link href={`/entries/${entry.id}`} className="badge">
                このエントリーを開く
              </Link>
            </div>
          </div>
        </div>
      </details>
    );
  }

  return (
    <div>
      <div className="card panel-highlight">
        <div className="section-head">
          <h1>エントリー一覧</h1>
          <Link href="/entries/new" className="fab-add" aria-label="新規エントリー作成">
            +
          </Link>
        </div>
        <p>作業中と完了済みを分けて表示しています。</p>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="card">
        <h3>作業中</h3>
        {inProgressEntries.length ? inProgressEntries.map(renderEntry) : <p>作業中のエントリーはありません。</p>}
      </div>

      <div className="card">
        <h3>完了済み</h3>
        {doneEntries.length ? doneEntries.map(renderEntry) : <p>完了済みエントリーはありません。</p>}
      </div>
    </div>
  );
}
