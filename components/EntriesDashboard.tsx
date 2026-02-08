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

const statusLabel: Record<string, string> = {
  DRAFT_FR: '下書き作成中',
  JP_AUTO_READY: '日本語文を確認中',
  JP_INTENT_LOCKED: '最終文を生成中',
  FINAL_FR_READY: '最終文の確認完了',
  EXPORTED: 'エクスポート済み'
};

const statusOptions = [
  { value: 'ALL', label: 'すべて' },
  { value: 'DRAFT_FR', label: '下書き中' },
  { value: 'JP_AUTO_READY', label: '日本語文確認' },
  { value: 'JP_INTENT_LOCKED', label: '最終文生成中' },
  { value: 'FINAL_FR_READY', label: '提出準備完了' },
  { value: 'EXPORTED', label: '出力済み' }
] as const;

export function EntriesDashboard() {
  const router = useRouter();
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]['value']>('ALL');

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }

    apiFetch<{ entries: EntryItem[] }>('/api/entries')
      .then((res) => setEntries(res.entries))
      .catch((err) => setError(err.message));
  }, [router]);

  const orderedEntries = useMemo(
    () => [...entries].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orderedEntries.filter((entry) => {
      const statusOk = statusFilter === 'ALL' || entry.status === statusFilter;
      const queryOk =
        !q || entry.title_fr.toLowerCase().includes(q) || (entry.final_fr ?? '').toLowerCase().includes(q);
      return statusOk && queryOk;
    });
  }, [orderedEntries, query, statusFilter]);

  async function deleteEntry(entry: EntryItem) {
    if (
      !confirm(
        `「${entry.title_fr}」を削除します。写真・メモ・エクスポートも削除されます。よろしいですか？`
      )
    ) {
      return;
    }
    setDeletingId(entry.id);
    setError(null);
    try {
      await apiFetch(`/api/entries/${entry.id}`, { method: 'DELETE' });
      setEntries((prev) => prev.filter((item) => item.id !== entry.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  function formatUpdatedAt(value: string) {
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    const minute = 60_000;
    const hour = minute * 60;
    const day = hour * 24;
    if (diffMs < hour) {
      return `${Math.max(1, Math.floor(diffMs / minute))}分前`;
    }
    if (diffMs < day) {
      return `${Math.floor(diffMs / hour)}時間前`;
    }
    return `${Math.floor(diffMs / day)}日前`;
  }

  return (
    <div className="page-stack">
      <div className="card panel-highlight">
        <div className="section-head">
          <h1>エントリー一覧</h1>
          <span className="badge">全 {entries.length} 件</span>
        </div>
      </div>

      <Link href="/entries/new" className="fab-add" aria-label="新規エントリー作成">
        <span className="fab-add-icon" aria-hidden>
          ＋
        </span>
        <span className="fab-add-text">新規</span>
      </Link>

      {error ? <p className="error">{error}</p> : null}

      <div className="card">
        <div className="list-toolbar">
          <label>
            検索
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="タイトルや最終文で検索"
            />
          </label>
          <label>
            ステータス
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="entry-list">
          {filteredEntries.length ? (
            filteredEntries.map((entry) => (
              <details key={entry.id} className="card accordion-card">
                <summary className="accordion-head">
                  <div>
                    <strong>{entry.title_fr}</strong>
                    <div className="timeline-detail">
                      更新: {formatUpdatedAt(entry.updated_at)}（{new Date(entry.updated_at).toLocaleString()}）
                    </div>
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
                    <div className="entry-actions">
                      <Link href={`/entries/${entry.id}`} className="entry-open-btn">
                        このエントリーを開く
                      </Link>
                      <button
                        type="button"
                        className="entry-delete-icon"
                        onClick={() => void deleteEntry(entry)}
                        disabled={deletingId === entry.id}
                        aria-label="このエントリーを削除"
                        title="このエントリーを削除"
                      >
                        {deletingId === entry.id ? '…' : '🗑'}
                      </button>
                    </div>
                  </div>
                </div>
              </details>
            ))
          ) : (
            <p>条件に合うエントリーがありません。</p>
          )}
        </div>
      </div>
    </div>
  );
}
