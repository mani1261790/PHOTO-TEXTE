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

export default function EntriesPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | EntryItem['status']>('ALL');
  const statusLabel: Record<string, string> = {
    DRAFT_FR: '下書き作成中',
    JP_AUTO_READY: '日本語文を確認中',
    JP_INTENT_LOCKED: '最終文を生成中',
    FINAL_FR_READY: '最終文の確認完了',
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

  const orderedEntries = useMemo(
    () => [...entries].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orderedEntries.filter((entry) => {
      const statusOk = statusFilter === 'ALL' || entry.status === statusFilter;
      const queryOk = !q || entry.title_fr.toLowerCase().includes(q) || (entry.final_fr ?? '').toLowerCase().includes(q);
      return statusOk && queryOk;
    });
  }, [orderedEntries, query, statusFilter]);

  const entryStats = useMemo(
    () => ({
      total: entries.length,
      finalReady: entries.filter((entry) => entry.status === 'FINAL_FR_READY' || entry.status === 'EXPORTED').length,
      drafting: entries.filter((entry) => entry.status === 'DRAFT_FR' || entry.status === 'JP_AUTO_READY').length
    }),
    [entries]
  );

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

  async function deleteEntry(entry: EntryItem) {
    if (!confirm(`「${entry.title_fr}」を削除します。写真・メモ・エクスポートも削除されます。よろしいですか？`)) {
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

  function renderEntry(entry: EntryItem) {
    return (
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
            <div className="actions-row">
              <Link href={`/entries/${entry.id}`} className="badge">
                このエントリーを開く
              </Link>
              <button
                type="button"
                className="link-danger"
                onClick={() => void deleteEntry(entry)}
                disabled={deletingId === entry.id}
              >
                {deletingId === entry.id ? '削除中…' : 'このエントリーを削除'}
              </button>
            </div>
          </div>
        </div>
      </details>
    );
  }

  return (
    <div className="page-stack">
      <div className="card panel-highlight">
        <div className="section-head">
          <h1>エントリー一覧</h1>
          <span className="badge">全 {entryStats.total} 件</span>
        </div>
        <div className="metric-grid">
          <div className="metric">
            <span>下書き中</span>
            <strong>{entryStats.drafting}</strong>
          </div>
          <div className="metric">
            <span>提出準備完了</span>
            <strong>{entryStats.finalReady}</strong>
          </div>
          <div className="metric">
            <span>総数</span>
            <strong>{entryStats.total}</strong>
          </div>
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
          <div className="status-filter-row">
            <button
              type="button"
              className={`filter-pill${statusFilter === 'ALL' ? ' active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              すべて
            </button>
            <button
              type="button"
              className={`filter-pill${statusFilter === 'DRAFT_FR' ? ' active' : ''}`}
              onClick={() => setStatusFilter('DRAFT_FR')}
            >
              下書き中
            </button>
            <button
              type="button"
              className={`filter-pill${statusFilter === 'JP_AUTO_READY' ? ' active' : ''}`}
              onClick={() => setStatusFilter('JP_AUTO_READY')}
            >
              日本語文確認
            </button>
            <button
              type="button"
              className={`filter-pill${statusFilter === 'JP_INTENT_LOCKED' ? ' active' : ''}`}
              onClick={() => setStatusFilter('JP_INTENT_LOCKED')}
            >
              最終文生成中
            </button>
            <button
              type="button"
              className={`filter-pill${statusFilter === 'FINAL_FR_READY' ? ' active' : ''}`}
              onClick={() => setStatusFilter('FINAL_FR_READY')}
            >
              提出準備完了
            </button>
            <button
              type="button"
              className={`filter-pill${statusFilter === 'EXPORTED' ? ' active' : ''}`}
              onClick={() => setStatusFilter('EXPORTED')}
            >
              出力済み
            </button>
          </div>
        </div>
        <div className="entry-list">
          {filteredEntries.length ? (
            filteredEntries.map(renderEntry)
          ) : (
            <p>条件に合うエントリーがありません。検索語や絞り込みを変更してください。</p>
          )}
        </div>
      </div>
    </div>
  );
}
