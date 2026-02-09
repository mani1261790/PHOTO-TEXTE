'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api/fetcher';
import { getAccessToken } from '@/lib/auth/token-store';
import { DiffToken } from '@/lib/diff/read-only';
import { useLanguage } from '@/components/LanguageProvider';

import { UnknownWords } from '@/components/UnknownWords';

type Entry = {
  id: string;
  title_fr: string;
  draft_fr: string;
  jp_auto: string | null;
  jp_intent: string | null;
  final_fr: string | null;
  status: 'DRAFT_FR' | 'JP_AUTO_READY' | 'JP_INTENT_LOCKED' | 'FINAL_FR_READY' | 'EXPORTED';
};

type Memo = {
  id: string;
  memo_type: 'TEACHER_FEEDBACK' | 'SELF_NOTE';
  content: string;
};

type HighlightToken = {
  token: string;
  unknown: boolean;
  lemma?: string;
  meaning?: string;
};

const statusIndex: Record<Entry['status'], number> = {
  DRAFT_FR: 0,
  JP_AUTO_READY: 1,
  JP_INTENT_LOCKED: 2,
  FINAL_FR_READY: 3,
  EXPORTED: 4
};

export function EntryWizard({ id }: { id: string }) {
  const router = useRouter();
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === 'fr' ? fr : ja);
  const steps = useMemo(
    () => [
      {
        key: 'DRAFT_FR',
        title: t('1. 下書きを入力', '1. Saisir le brouillon'),
        detail: t('タイトルと本文を入力すると自動保存されます', 'Le titre et le texte sont enregistrés automatiquement.')
      },
      {
        key: 'JP_AUTO_READY',
        title: t('2. 日本語文を確認', '2. Vérifier le texte japonais'),
        detail: t('フランス語の下書きから自動で日本語文を作成します', 'Le japonais est généré depuis le brouillon français.')
      },
      {
        key: 'JP_INTENT_LOCKED',
        title: t('3. 日本語文を確定', '3. Valider le texte japonais'),
        detail: t('確定後に最終フランス語を生成します', 'La validation déclenche la génération du français final.')
      },
      {
        key: 'FINAL_FR_READY',
        title: t('4. 最終文を確認', '4. Vérifier le texte final'),
        detail: t('最終文は自動生成され、編集できません', 'Le texte final est généré automatiquement et non modifiable.')
      },
      {
        key: 'EXPORTED',
        title: t('5. 提出資料を出力', '5. Exporter le dossier'),
        detail: t('PPTXをダウンロードして提出します', 'Téléchargez le PPTX pour le rendre.')
      }
    ],
    [language]
  );
  const statusLabel: Record<Entry['status'], string> = useMemo(
    () => ({
      DRAFT_FR: t('下書き入力中', 'Brouillon en cours'),
      JP_AUTO_READY: t('日本語文を確認中', 'Vérif. du japonais'),
      JP_INTENT_LOCKED: t('最終文を生成中', 'Final en cours'),
      FINAL_FR_READY: t('最終文の確認完了', 'Final validé'),
      EXPORTED: t('提出資料を出力済み', 'Export effectué')
    }),
    [language]
  );
  const [entry, setEntry] = useState<Entry | null>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [jpIntentDraft, setJpIntentDraft] = useState('');
  const [memoContent, setMemoContent] = useState('');
  const [diffTokens, setDiffTokens] = useState<DiffToken[]>([]);
  const [draftHighlights, setDraftHighlights] = useState<HighlightToken[]>([]);
  const [finalHighlights, setFinalHighlights] = useState<HighlightToken[]>([]);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const lastSavedDraftRef = useRef<{ title_fr: string; draft_fr: string } | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTranslateInFlightRef = useRef(false);
  const draftCardRef = useRef<HTMLDivElement | null>(null);
  const jpAutoCardRef = useRef<HTMLDivElement | null>(null);
  const jpIntentCardRef = useRef<HTMLDivElement | null>(null);
  const finalCardRef = useRef<HTMLDivElement | null>(null);
  const exportCardRef = useRef<HTMLDivElement | null>(null);
  const finalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const initializedVisibleStepRef = useRef(false);
  const previousVisibleStepRef = useRef<string>('draft');

  const draftEditable = useMemo(
    () => entry?.status === 'DRAFT_FR' || entry?.status === 'JP_AUTO_READY',
    [entry]
  );

  const progress = useMemo(() => {
    if (!entry) return 0;
    return Math.round(((statusIndex[entry.status] + 1) / steps.length) * 100);
  }, [entry, steps.length]);

  const unknownWordCount = useMemo(
    () =>
      draftHighlights.filter((token) => token.unknown).length +
      finalHighlights.filter((token) => token.unknown).length,
    [draftHighlights, finalHighlights]
  );

  async function loadEntry() {
    const [entryData, memoData] = await Promise.all([
      apiFetch<Entry>(`/api/entries/${id}`),
      apiFetch<{ memos: Memo[] }>(`/api/entries/${id}/memos`)
    ]);
    setEntry(entryData);
    setMemos(memoData.memos);
    setJpIntentDraft(entryData.jp_auto ?? '');
    lastSavedDraftRef.current = { title_fr: entryData.title_fr, draft_fr: entryData.draft_fr };

    if (entryData.final_fr) {
      const diff = await apiFetch<{
        diff: { tokens: DiffToken[] };
        draft_highlights: HighlightToken[];
        final_highlights: HighlightToken[];
      }>(`/api/entries/${id}/diff`);
      setDiffTokens(diff.diff.tokens);
      setDraftHighlights(diff.draft_highlights);
      setFinalHighlights(diff.final_highlights);
    } else {
      setDiffTokens([]);
      setDraftHighlights([]);
      setFinalHighlights([]);
      setShowDiff(false);
    }
  }

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }

    loadEntry().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  useEffect(() => {
    if (!entry || !draftEditable) return;
    if (!entry.title_fr.trim() || !entry.draft_fr.trim()) return;
    if (
      lastSavedDraftRef.current &&
      lastSavedDraftRef.current.title_fr === entry.title_fr &&
      lastSavedDraftRef.current.draft_fr === entry.draft_fr
    ) {
      return;
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      void updateDraftFields({ autoTranslate: true, silent: true });
    }, 800);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [entry, draftEditable]);

  useEffect(() => {
    if (showDiff) return;
    if (!entry?.final_fr) return;
    const el = finalTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [entry?.final_fr, showDiff]);

  async function updateDraftFields(options?: { autoTranslate?: boolean; silent?: boolean }) {
    if (!entry || !draftEditable) return;
    const silent = options?.silent ?? false;
    if (!silent) {
      setBusy(true);
    } else {
      setDraftSaving(true);
    }
    setError(null);
    try {
      const updated = await apiFetch<Entry>(`/api/entries/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title_fr: entry.title_fr, draft_fr: entry.draft_fr })
      });
      setEntry(updated);
      lastSavedDraftRef.current = { title_fr: updated.title_fr, draft_fr: updated.draft_fr };
      if (
        options?.autoTranslate &&
        (updated.status === 'DRAFT_FR' || updated.status === 'JP_AUTO_READY')
      ) {
        await translate({ auto: true });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!silent) {
        setBusy(false);
      } else {
        setDraftSaving(false);
      }
    }
  }

  async function translate(options?: { auto?: boolean }) {
    if (options?.auto && autoTranslateInFlightRef.current) return;
    if (options?.auto) {
      autoTranslateInFlightRef.current = true;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Entry>(`/api/entries/${id}/translate`, {
        method: 'POST',
        body: '{}'
      });
      setEntry(updated);
      setJpIntentDraft(updated.jp_auto ?? '');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      autoTranslateInFlightRef.current = false;
    }
  }

  async function lockIntent() {
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Entry>(`/api/entries/${id}/lock_intent`, {
        method: 'POST',
        body: JSON.stringify({ jp_intent: jpIntentDraft })
      });
      setEntry(updated);
      await loadEntry();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createMemo() {
    if (!memoContent.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/entries/${id}/memos`, {
        method: 'POST',
        body: JSON.stringify({ memo_type: 'SELF_NOTE', content: memoContent })
      });
      setMemoContent('');
      await loadEntry();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function exportPptx() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ token: string }>(`/api/entries/${id}/export/pptx`, {
        method: 'POST',
        body: JSON.stringify({ include_memos: false })
      });
      setExportUrl(`/api/exports/${result.token}/download`);
      await loadEntry();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const currentIndex = entry ? statusIndex[entry.status] : 0;
  const draftDone = currentIndex >= statusIndex.JP_AUTO_READY;
  const jpAutoDone = currentIndex >= statusIndex.JP_INTENT_LOCKED;
  const jpIntentDone = currentIndex >= statusIndex.FINAL_FR_READY;
  const finalDone = Boolean(entry?.final_fr);
  const exportDone = entry?.status === 'EXPORTED';
  const showJpAutoCard = currentIndex >= statusIndex.JP_AUTO_READY;
  const showJpIntentCard = currentIndex >= statusIndex.JP_AUTO_READY;
  const showFinalCard = currentIndex >= statusIndex.JP_INTENT_LOCKED || Boolean(entry?.final_fr);
  const showExportCard = currentIndex >= statusIndex.FINAL_FR_READY;

  const visibleStepKey = showExportCard
    ? 'export'
    : showFinalCard
      ? 'final'
      : currentIndex === statusIndex.JP_AUTO_READY
        ? 'jpAuto'
        : showJpIntentCard
          ? 'jpIntent'
          : showJpAutoCard
            ? 'jpAuto'
            : 'draft';

  useEffect(() => {
    if (!entry) {
      return;
    }
    if (!initializedVisibleStepRef.current) {
      initializedVisibleStepRef.current = true;
      previousVisibleStepRef.current = visibleStepKey;
      return;
    }
    if (previousVisibleStepRef.current === visibleStepKey) {
      return;
    }
    previousVisibleStepRef.current = visibleStepKey;

    const target =
      visibleStepKey === 'export'
        ? exportCardRef.current
        : visibleStepKey === 'final'
          ? finalCardRef.current
          : visibleStepKey === 'jpIntent'
            ? jpIntentCardRef.current
            : visibleStepKey === 'jpAuto'
              ? jpAutoCardRef.current
              : draftCardRef.current;

    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [entry, visibleStepKey]);

  if (!entry) {
    return <div className="card">{t('エントリーを読み込み中...', 'Chargement de l’entrée...')}</div>;
  }

  return (
    <div className="wizard-shell">
      <aside className="card timeline desktop-only">
        <h3>{t('進捗', 'Progression')}</h3>
        <p className="badge">{t(`${progress}% 完了`, `${progress}% terminé`)}</p>
        {steps.map((step, index) => {
          const className =
            index < currentIndex
              ? 'timeline-step done'
              : index === currentIndex
                ? 'timeline-step active'
                : 'timeline-step';
          return (
            <div key={step.key} className={className}>
              <strong>{step.title}</strong>
              <div className="timeline-detail">{step.detail}</div>
            </div>
          );
        })}
        <p>
          <Link href="/">{t('一覧に戻る', 'Retour à la liste')}</Link>
        </p>
      </aside>

      <section>
        <div className="mobile-progress">
          <div className="mobile-progress-row">
            <strong>{t(`進捗 ${progress}%`, `Progression ${progress}%`)}</strong>
            <span className="badge">{statusLabel[entry.status]}</span>
          </div>
          <div className="progress-track" aria-hidden>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="card hero desktop-only">
          <div className="hero-title-row">
            <h1>{entry.title_fr || 'PHOTO-TEXTE'}</h1>
            <span className="badge">{statusLabel[entry.status]}</span>
          </div>
          <div className="metric-grid">
            <div className="metric">
              <span>{t('進捗', 'Progression')}</span>
              <strong>{progress}%</strong>
            </div>
            <div className="metric">
              <span>{t('未知語', 'Mots inconnus')}</span>
              <strong>{unknownWordCount}</strong>
            </div>
            <div className="metric">
              <span>{t('メモ', 'Notes')}</span>
              <strong>{memos.length}</strong>
            </div>
          </div>
        </div>

        <div ref={draftCardRef} className={`card step-card${draftDone ? ' step-done' : ''}`}>
          <div className="step-head">
            <h3>{t('下書き入力', 'Brouillon')}</h3>
            {draftDone ? <span className="step-check">✓</span> : null}
          </div>
          <label>
            {t('タイトル（フランス語）', 'Titre (français)')}
            <input
              value={entry.title_fr}
              onChange={(e) => setEntry({ ...entry, title_fr: e.target.value })}
              disabled={!draftEditable || busy}
            />
          </label>
          <label>
            {t('下書き本文（フランス語）', 'Texte du brouillon (français)')}
            <textarea
              rows={6}
              value={entry.draft_fr}
              onChange={(e) => setEntry({ ...entry, draft_fr: e.target.value })}
              disabled={!draftEditable || busy}
            />
          </label>
          {draftSaving ? <p className="badge">{t('自動保存しています…', 'Enregistrement auto…')}</p> : null}
          {entry.status !== 'DRAFT_FR' && entry.status !== 'JP_AUTO_READY' ? (
            <p className="badge">{t('日本語文の確定後は編集できません', 'Impossible après validation du japonais.')}</p>
          ) : null}
        </div>

        {showJpAutoCard ? (
          <div ref={jpAutoCardRef} className={`card step-card${jpAutoDone ? ' step-done' : ''}`}>
            <div className="step-head">
              <h3>{t('日本語文', 'Texte japonais')}</h3>
              {jpAutoDone ? <span className="step-check">✓</span> : null}
            </div>
            <textarea rows={6} value={entry.jp_auto ?? ''} readOnly />
          </div>
        ) : null}

        {showJpIntentCard ? (
          <div ref={jpIntentCardRef} className={`card step-card${jpIntentDone ? ' step-done' : ''}`}>
            <div className="step-head">
              <h3>{t('日本語文を確定', 'Valider le texte japonais')}</h3>
              {jpIntentDone ? <span className="step-check">✓</span> : null}
            </div>
            {entry.status === 'JP_AUTO_READY' ? (
              <>
                <textarea
                  rows={6}
                  value={jpIntentDraft}
                  onChange={(e) => setJpIntentDraft(e.target.value)}
                />
                <button type="button" onClick={lockIntent} disabled={busy || !jpIntentDraft.trim()}>
                  {t('日本語文を確定', 'Valider le texte japonais')}
                </button>
              </>
            ) : (
              <textarea rows={6} value={entry.jp_intent ?? jpIntentDraft} readOnly />
            )}
          </div>
        ) : null}

        {showFinalCard ? (
          <div ref={finalCardRef} className={`card step-card${finalDone ? ' step-done' : ''}`}>
            <div className="step-head">
              <h3>{t('最終フランス語', 'Français final')}</h3>
              {finalDone ? <span className="step-check">✓</span> : null}
            </div>
            {entry.status === 'JP_INTENT_LOCKED' && !entry.final_fr ? (
              <p className="badge">{t('最終フランス語を自動生成しています…', 'Génération du français final…')}</p>
            ) : null}
            {showDiff && diffTokens.length ? (
              <pre className="diff-block diff-inline">
                {diffTokens.map((token, idx) => {
                  if (token.kind === 'add') {
                    return (
                      <span key={idx} className="diff-add">
                        +{token.value}
                      </span>
                    );
                  }
                  if (token.kind === 'remove') {
                    return (
                      <span key={idx} className="diff-remove">
                        -{token.value}
                      </span>
                    );
                  }
                  return <span key={idx}>{token.value}</span>;
                })}
              </pre>
            ) : (
              <textarea
                ref={finalTextareaRef}
                className="auto-grow"
                rows={1}
                value={entry.final_fr ?? ''}
                readOnly
              />
            )}
            {entry.final_fr ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowDiff((current) => !current)}
              >
                {showDiff ? t('差分を隠す', 'Masquer le diff') : t('差分を表示', 'Afficher le diff')}
              </button>
            ) : null}
          </div>
        ) : null}

        {showFinalCard && entry.final_fr ? (
          <UnknownWords label={t('下書きのフランス語', 'Français du brouillon')} tokens={draftHighlights} />
        ) : null}
        {showFinalCard && entry.final_fr ? (
          <UnknownWords label={t('最終文のフランス語', 'Français final')} tokens={finalHighlights} />
        ) : null}

        {showExportCard ? (
          <div ref={exportCardRef} className={`card step-card${exportDone ? ' step-done' : ''}`}>
            <div className="step-head">
              <h3>{t('提出用PPTXを出力', 'Exporter le PPTX')}</h3>
              {exportDone ? <span className="step-check">✓</span> : null}
            </div>
            <button
              type="button"
              onClick={exportPptx}
              disabled={busy || (entry.status !== 'FINAL_FR_READY' && entry.status !== 'EXPORTED')}
            >
              {t('エクスポートを生成', "Générer l'export")}
            </button>
            {exportUrl ? (
              <p>
                <a href={exportUrl}>{t('最新PPTXをダウンロード', 'Télécharger le PPTX')}</a>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="card">
          <h3>{t('メモ', 'Notes')}</h3>
          <textarea
            rows={4}
            value={memoContent}
            onChange={(e) => setMemoContent(e.target.value)}
            placeholder={t('先生からの指摘や自分用メモを入力', 'Saisissez les remarques ou notes personnelles')}
          />
          <button type="button" onClick={createMemo} disabled={busy || !memoContent.trim()}>
            {t('メモを追加', 'Ajouter une note')}
          </button>
          {memos.map((memo) => (
            <p key={memo.id}>{memo.content}</p>
          ))}
        </div>

        {error ? <p className="error">{error}</p> : null}
      </section>
    </div>
  );
}
