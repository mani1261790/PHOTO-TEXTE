'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api/fetcher';
import { getAccessToken } from '@/lib/auth/token-store';
import { useLanguage } from '@/components/LanguageProvider';

type EntryItem = {
  id: string;
  title_fr: string;
  status: string;
  final_fr: string | null;
  photo_preview_url: string | null;
  entry_photos: {
    id: string;
    position: number;
    final_fr: string | null;
    photo_preview_url: string | null;
  }[];
  updated_at: string;
};

export function EntriesDashboard() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === 'fr' ? fr : ja);
  const statusOptions = [
    { value: 'ALL', label: t('すべて', 'Tous') },
    { value: 'DRAFT_FR', label: t('下書き中', 'Brouillon') },
    { value: 'JP_AUTO_READY', label: t('日本語文確認', 'Vérif. JP') },
    { value: 'JP_INTENT_LOCKED', label: t('最終文生成中', 'Final en cours') },
    { value: 'FINAL_FR_READY', label: t('提出準備完了', 'Prêt à remettre') },
    { value: 'EXPORTED', label: t('出力済み', 'Exporté') }
  ] as const;
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]['value']>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }

    apiFetch<{ entries: EntryItem[] }>('/api/entries')
      .then((res) => setEntries(res.entries))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  const orderedEntries = useMemo(
    () => [...entries].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orderedEntries.filter((entry) => {
      const statusOk = statusFilter === 'ALL' || entry.status === statusFilter;
      const photoQueryOk = entry.entry_photos?.some((photo) =>
        (photo.final_fr ?? '').toLowerCase().includes(q)
      );
      const queryOk =
        !q ||
        entry.title_fr.toLowerCase().includes(q) ||
        (entry.final_fr ?? '').toLowerCase().includes(q) ||
        Boolean(photoQueryOk);
      return statusOk && queryOk;
    });
  }, [orderedEntries, query, statusFilter]);

  async function deleteEntry(entry: EntryItem) {
    if (
      !confirm(
        t(
          `「${entry.title_fr}」を削除します。写真・メモ・エクスポートも削除されます。よろしいですか？`,
          `Supprimer « ${entry.title_fr} » ? Les photos, notes et exports seront aussi supprimés.`
        )
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
      return language === 'fr'
        ? `il y a ${Math.max(1, Math.floor(diffMs / minute))} min`
        : `${Math.max(1, Math.floor(diffMs / minute))}分前`;
    }
    if (diffMs < day) {
      return language === 'fr'
        ? `il y a ${Math.floor(diffMs / hour)} h`
        : `${Math.floor(diffMs / hour)}時間前`;
    }
    return language === 'fr' ? `il y a ${Math.floor(diffMs / day)} j` : `${Math.floor(diffMs / day)}日前`;
  }

  return (
    <div className="page-stack">
      <div className="card panel-highlight">
        <div className="section-head entries-head">
          <h1>{t('エントリー一覧', 'Entrées')}</h1>
          <span className="badge">{t(`全 ${entries.length} 件`, `Total ${entries.length}`)}</span>
        </div>
      </div>

      <Link href="/entries/new" className="fab-add" aria-label={t('新規エントリー作成', 'Nouvelle entrée')}>
        <span className="fab-add-icon" aria-hidden>
          ＋
        </span>
        <span className="fab-add-text">{t('新規', 'Nouveau')}</span>
      </Link>

      {error ? <p className="error">{error}</p> : null}

      <div className="card">
        <div className="list-toolbar">
          <label>
            {t('検索', 'Recherche')}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('タイトルや最終文で検索', 'Titre ou texte final')}
            />
          </label>
          <label>
            {t('ステータス', 'Statut')}
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
          {loading ? (
            <p>{t('読み込み中...', 'Chargement...')}</p>
          ) : filteredEntries.length ? (
            filteredEntries.map((entry) => (
              <details key={entry.id} className="card accordion-card">
                <summary className="accordion-head">
                  <div>
                    <strong>{entry.title_fr}</strong>
                    <div className="timeline-detail">
                      {t('更新', 'Mis à jour')}:{' '}
                      {formatUpdatedAt(entry.updated_at)}（{new Date(entry.updated_at).toLocaleString()}）
                    </div>
                  </div>
                </summary>

                <div className="accordion-body">
                  <div>
                    <h4>{t('写真と文章', 'Photos & textes')}</h4>
                    <div className="entry-photo-strip">
                      {entry.entry_photos?.length ? (
                        entry.entry_photos.map((photo) => (
                          <div key={photo.id} className="entry-photo-card">
                            <div className="entry-photo-media">
                              {photo.photo_preview_url ? (
                                <img
                                  src={photo.photo_preview_url}
                                  alt={`${entry.title_fr} ${photo.position}`}
                                  className="entry-thumb"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="entry-thumb entry-thumb-empty">
                                  {t('写真なし', 'Pas de photo')}
                                </div>
                              )}
                              <span className="badge">
                                {t('写真', 'Photo')} {photo.position}
                              </span>
                            </div>
                            <p className="entry-photo-text entry-photo-copy">
                              {photo.final_fr ??
                                t(
                                  'まだ最終文は生成されていません。',
                                  'Le texte final n’est pas prêt.'
                                )}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="timeline-detail">
                          {t('写真がありません。', 'Aucune photo.')}
                        </p>
                      )}
                    </div>
                    <div className="entry-actions">
                      <Link href={`/entries/${entry.id}`} className="entry-open-btn">
                        {t('このエントリーを開く', 'Ouvrir cette entrée')}
                      </Link>
                      <button
                        type="button"
                        className="entry-delete-icon"
                        onClick={() => void deleteEntry(entry)}
                        disabled={deletingId === entry.id}
                        aria-label={t('このエントリーを削除', 'Supprimer cette entrée')}
                        title={t('このエントリーを削除', 'Supprimer cette entrée')}
                      >
                        {deletingId === entry.id ? (
                          t('…', '…')
                        ) : (
                          <svg
                            className="icon-trash"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"
                              fill="currentColor"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </details>
            ))
          ) : (
            <p>{t('条件に合うエントリーがありません。', 'Aucune entrée ne correspond aux critères.')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
