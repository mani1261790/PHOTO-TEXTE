'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api/fetcher';
import { getAccessToken } from '@/lib/auth/token-store';
import { useLanguage } from '@/components/LanguageProvider';

const NEW_ENTRY_DRAFT_STORAGE_KEY = 'photo-texte:new-entry-draft:v1';
const NEW_ENTRY_DRAFT_DB = 'photo-texte-drafts';
const NEW_ENTRY_DRAFT_STORE = 'new-entry';
const NEW_ENTRY_DRAFT_ID = 'current';

type LocalNewEntryDraft = {
  titleFr: string;
  draftByPhotoKey: Record<string, string>;
  updatedAt: string;
};

type IndexedPhotoDraft = {
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
  draftFr: string;
};

type IndexedNewEntryDraft = {
  id: string;
  titleFr: string;
  photos: IndexedPhotoDraft[];
  updatedAt: string;
};

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
  is_local_draft?: boolean;
};

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(NEW_ENTRY_DRAFT_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NEW_ENTRY_DRAFT_STORE)) {
        db.createObjectStore(NEW_ENTRY_DRAFT_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadIndexedDraft(): Promise<IndexedNewEntryDraft | null> {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NEW_ENTRY_DRAFT_STORE, 'readonly');
    const store = tx.objectStore(NEW_ENTRY_DRAFT_STORE);
    const req = store.get(NEW_ENTRY_DRAFT_ID);
    req.onsuccess = () => {
      resolve((req.result as IndexedNewEntryDraft | undefined) ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

async function clearIndexedDraft(): Promise<void> {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NEW_ENTRY_DRAFT_STORE, 'readwrite');
    tx.objectStore(NEW_ENTRY_DRAFT_STORE).delete(NEW_ENTRY_DRAFT_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

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
  const [localDraft, setLocalDraft] = useState<EntryItem | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]['value']>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }

    let active = true;
    const raw = window.localStorage.getItem(NEW_ENTRY_DRAFT_STORAGE_KEY);
    let parsed: LocalNewEntryDraft | null = null;
    try {
      parsed = raw ? (JSON.parse(raw) as LocalNewEntryDraft) : null;
    } catch {
      parsed = null;
    }

    loadIndexedDraft()
      .then((indexed) => {
        if (!active) return;

        const title =
          indexed?.titleFr?.trim() ||
          parsed?.titleFr?.trim() ||
          t('作成途中の新規エントリー', 'Nouveau brouillon local');

        const fromIndexed = (indexed?.photos ?? []).map((photo, idx) => ({
          id: `__local_photo_${idx + 1}__`,
          position: idx + 1,
          final_fr: photo.draftFr ?? null,
          photo_preview_url: URL.createObjectURL(photo.blob)
        }));

        const fromStorage = Object.values(parsed?.draftByPhotoKey ?? {})
          .filter((text) => Boolean(text.trim()))
          .map((text, idx) => ({
            id: `__local_photo_${idx + 1}__`,
            position: idx + 1,
            final_fr: text,
            photo_preview_url: null
          }));

        const entryPhotos = fromIndexed.length ? fromIndexed : fromStorage;

        if (!title.trim() && !entryPhotos.length) {
          setLocalDraft(null);
          return;
        }

        setLocalDraft({
          id: '__local_new_entry__',
          title_fr: title,
          status: 'DRAFT_FR',
          final_fr: null,
          photo_preview_url: entryPhotos[0]?.photo_preview_url ?? null,
          entry_photos: entryPhotos,
          updated_at: indexed?.updatedAt || parsed?.updatedAt || new Date().toISOString(),
          is_local_draft: true
        });
      })
      .catch(() => {
        if (!active) return;
        const drafts = Object.values(parsed?.draftByPhotoKey ?? {}).filter((text) => Boolean(text.trim()));
        if (!parsed?.titleFr?.trim() && !drafts.length) {
          setLocalDraft(null);
          return;
        }
        setLocalDraft({
          id: '__local_new_entry__',
          title_fr: parsed?.titleFr?.trim() || t('作成途中の新規エントリー', 'Nouveau brouillon local'),
          status: 'DRAFT_FR',
          final_fr: null,
          photo_preview_url: null,
          entry_photos: drafts.map((text, idx) => ({
            id: `__local_photo_${idx + 1}__`,
            position: idx + 1,
            final_fr: text,
            photo_preview_url: null
          })),
          updated_at: parsed?.updatedAt || new Date().toISOString(),
          is_local_draft: true
        });
      });

    apiFetch<{ entries: EntryItem[] }>('/api/entries')
      .then((res) => setEntries(res.entries))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    return () => {
      active = false;
    };
  }, [router, language]);

  useEffect(() => {
    return () => {
      for (const photo of localDraft?.entry_photos ?? []) {
        if (!photo.photo_preview_url?.startsWith('blob:')) continue;
        try {
          URL.revokeObjectURL(photo.photo_preview_url);
        } catch {
          // no-op
        }
      }
    };
  }, [localDraft]);

  const orderedEntries = useMemo(
    () => [...(localDraft ? [localDraft] : []), ...entries].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [entries, localDraft]
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
    if (entry.is_local_draft) {
      if (!confirm(t('この端末の作成途中データを削除します。よろしいですか？', 'Supprimer ce brouillon local de cet appareil ?'))) {
        return;
      }
      window.localStorage.removeItem(NEW_ENTRY_DRAFT_STORAGE_KEY);
      void clearIndexedDraft().catch(() => undefined);
      setLocalDraft(null);
      return;
    }

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
          <span className="badge">{t(`全 ${orderedEntries.length} 件`, `Total ${orderedEntries.length}`)}</span>
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
                    {entry.is_local_draft ? (
                      <div className="timeline-detail">
                        {t('この端末の下書き', 'Brouillon local (cet appareil)')}
                      </div>
                    ) : null}
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
                      <Link href={entry.is_local_draft ? '/entries/new' : `/entries/${entry.id}`} className="entry-open-btn">
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
