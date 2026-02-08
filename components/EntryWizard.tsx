'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api/fetcher';
import { getAccessToken } from '@/lib/auth/token-store';
import { DiffToken } from '@/lib/diff/read-only';

import { DiffReadOnly } from '@/components/DiffReadOnly';
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

const steps = [
  { key: 'DRAFT_FR', title: '1. 下書きを入力', detail: 'タイトルと本文を入力すると自動保存されます' },
  {
    key: 'JP_AUTO_READY',
    title: '2. 日本語文を確認',
    detail: 'フランス語の下書きから自動で日本語文を作成します'
  },
  { key: 'JP_INTENT_LOCKED', title: '3. 日本語文を確定', detail: '確定後に最終フランス語を生成します' },
  { key: 'FINAL_FR_READY', title: '4. 最終文を確認', detail: '最終文は自動生成され、編集できません' },
  { key: 'EXPORTED', title: '5. 提出資料を出力', detail: 'PPTXをダウンロードして提出します' }
] as const;

const statusIndex: Record<Entry['status'], number> = {
  DRAFT_FR: 0,
  JP_AUTO_READY: 1,
  JP_INTENT_LOCKED: 2,
  FINAL_FR_READY: 3,
  EXPORTED: 4
};

const statusLabel: Record<Entry['status'], string> = {
  DRAFT_FR: '下書き入力中',
  JP_AUTO_READY: '日本語文を確認中',
  JP_INTENT_LOCKED: '最終文を生成中',
  FINAL_FR_READY: '最終文の確認完了',
  EXPORTED: '提出資料を出力済み'
};

const nextActionByStatus: Record<Entry['status'], string> = {
  DRAFT_FR: 'タイトルと下書きを入力してください。保存と翻訳は自動で進みます。',
  JP_AUTO_READY: '日本語文を確認して、問題なければ「日本語文を確定」を押してください。',
  JP_INTENT_LOCKED: '最終フランス語を自動生成しています。少しお待ちください。',
  FINAL_FR_READY: '差分を確認したら「エクスポートを生成」で提出資料を作成してください。',
  EXPORTED: '必要なら再エクスポートするか、メモを追記してください。'
};

export function EntryWizard({ id }: { id: string }) {
  const router = useRouter();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [jpIntentDraft, setJpIntentDraft] = useState('');
  const [memoContent, setMemoContent] = useState('');
  const [memoType, setMemoType] = useState<Memo['memo_type']>('SELF_NOTE');
  const [diffTokens, setDiffTokens] = useState<DiffToken[]>([]);
  const [draftHighlights, setDraftHighlights] = useState<HighlightToken[]>([]);
  const [finalHighlights, setFinalHighlights] = useState<HighlightToken[]>([]);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const lastSavedDraftRef = useRef<{ title_fr: string; draft_fr: string } | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTranslateInFlightRef = useRef(false);

  const draftEditable = useMemo(
    () => entry?.status === 'DRAFT_FR' || entry?.status === 'JP_AUTO_READY',
    [entry]
  );

  const progress = useMemo(() => {
    if (!entry) return 0;
    return Math.round(((statusIndex[entry.status] + 1) / steps.length) * 100);
  }, [entry]);

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
    }
  }

  let primaryAction = {
    label: '処理中...',
    disabled: true,
    onClick: () => undefined,
    detail: ''
  };
  if (!entry) {
    primaryAction = {
      label: '読み込み中...',
      disabled: true,
      onClick: () => undefined,
      detail: ''
    };
  } else if (!busy && entry.status === 'DRAFT_FR') {
    primaryAction = {
      label: '下書きを保存して日本語文を更新',
      disabled: !entry.title_fr.trim() || !entry.draft_fr.trim(),
      onClick: () => void updateDraftFields({ autoTranslate: true }),
      detail: 'まずは下書きを保存し、日本語文を自動更新します。'
    };
  } else if (!busy && entry.status === 'JP_AUTO_READY') {
    primaryAction = {
      label: '日本語文を確定して最終文を生成',
      disabled: !jpIntentDraft.trim(),
      onClick: () => void lockIntent(),
      detail: '日本語文を確定すると、最終フランス語を生成します。'
    };
  } else if (entry.status === 'JP_INTENT_LOCKED') {
    primaryAction = {
      label: '最終フランス語を生成中...',
      disabled: true,
      onClick: () => undefined,
      detail: 'このまま数秒お待ちください。'
    };
  } else if (!busy) {
    primaryAction = {
      label: '提出用PPTXを生成',
      disabled: false,
      onClick: () => void exportPptx(),
      detail: '最終文を確認できたらPPTXを出力できます。'
    };
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
        body: JSON.stringify({ memo_type: memoType, content: memoContent })
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

  async function deleteEntry() {
    if (!confirm('このエントリーと写真・メモ・エクスポートを完全に削除します。よろしいですか？')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/entries/${id}`, { method: 'DELETE' });
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!entry) {
    return <div className="card">エントリーを読み込み中...</div>;
  }

  return (
    <div className="wizard-shell">
      <aside className="card timeline">
        <h3>進捗</h3>
        <p className="badge">{progress}% 完了</p>
        {steps.map((step, index) => {
          const currentIndex = statusIndex[entry.status];
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
          <Link href="/">一覧に戻る</Link>
        </p>
      </aside>

      <section>
        <div className="card hero">
          <div className="hero-title-row">
            <h1>{entry.title_fr || 'PHOTO-TEXTE'}</h1>
            <span className="badge">{statusLabel[entry.status]}</span>
          </div>
          <p>迷ったら、下の「次の操作」ボタンだけ押せば先に進めます。</p>
          <div className="metric-grid">
            <div className="metric">
              <span>進捗</span>
              <strong>{progress}%</strong>
            </div>
            <div className="metric">
              <span>未知語</span>
              <strong>{unknownWordCount}</strong>
            </div>
            <div className="metric">
              <span>メモ</span>
              <strong>{memos.length}</strong>
            </div>
          </div>
        </div>

        <div className="card panel-highlight">
          <div className="section-head">
            <h3>次の操作</h3>
            <span className="badge">{statusLabel[entry.status]}</span>
          </div>
          <p>{primaryAction.detail}</p>
          <button type="button" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
            {primaryAction.label}
          </button>
        </div>

        <div className="card panel-highlight">
          <div className="section-head">
            <h3>次にやること</h3>
            <span className="badge">{statusLabel[entry.status]}</span>
          </div>
          <p>{nextActionByStatus[entry.status]}</p>
        </div>

        <div className="card">
          <h3>下書き入力（自動保存）</h3>
          <label>
            タイトル（フランス語）
            <input
              value={entry.title_fr}
              onChange={(e) => setEntry({ ...entry, title_fr: e.target.value })}
              disabled={!draftEditable || busy}
            />
          </label>
          <label>
            下書き本文（フランス語）
            <textarea
              rows={6}
              value={entry.draft_fr}
              onChange={(e) => setEntry({ ...entry, draft_fr: e.target.value })}
              disabled={!draftEditable || busy}
            />
          </label>
          {draftSaving ? <p className="badge">自動保存しています…</p> : null}
          {entry.status !== 'DRAFT_FR' && entry.status !== 'JP_AUTO_READY' ? (
            <p className="badge">日本語文の確定後は編集できません</p>
          ) : null}
        </div>

        <div className="card">
          <h3>日本語文（自動生成）</h3>
          {entry.status === 'DRAFT_FR' ? (
            <p className="badge">下書き入力後に自動で日本語文を作成します</p>
          ) : null}
          <textarea rows={6} value={entry.jp_auto ?? ''} readOnly />
        </div>

        <div className="card">
          <h3>日本語文を確定（最後の編集）</h3>
          {entry.status === 'JP_AUTO_READY' ? (
            <>
              <textarea
                rows={6}
                value={jpIntentDraft}
                onChange={(e) => setJpIntentDraft(e.target.value)}
              />
              <button type="button" onClick={lockIntent} disabled={busy || !jpIntentDraft.trim()}>
                日本語文を確定
              </button>
            </>
          ) : (
            <textarea rows={6} value={entry.jp_intent ?? jpIntentDraft} readOnly />
          )}
        </div>

        <div className="card">
          <h3>最終フランス語（自動生成・編集不可）</h3>
          {entry.status === 'JP_INTENT_LOCKED' && !entry.final_fr ? (
            <p className="badge">最終フランス語を自動生成しています…</p>
          ) : null}
          <textarea rows={7} value={entry.final_fr ?? ''} readOnly />
        </div>

        {entry.final_fr ? (
          <>
            <DiffReadOnly tokens={diffTokens} />
            <UnknownWords label="下書き（フランス語）" tokens={draftHighlights} />
            <UnknownWords label="最終文（フランス語）" tokens={finalHighlights} />
          </>
        ) : null}

        <div className="card">
          <h3>提出用PPTXを出力</h3>
          <button
            type="button"
            onClick={exportPptx}
            disabled={busy || (entry.status !== 'FINAL_FR_READY' && entry.status !== 'EXPORTED')}
          >
            エクスポートを生成
          </button>
          {exportUrl ? (
            <p>
              <a href={exportUrl}>最新PPTXをダウンロード</a>
            </p>
          ) : null}
        </div>

        <div className="card">
          <h3>メモ</h3>
          <label>
            メモ種別
            <select value={memoType} onChange={(e) => setMemoType(e.target.value as Memo['memo_type'])}>
              <option value="SELF_NOTE">自己メモ</option>
              <option value="TEACHER_FEEDBACK">先生フィードバック</option>
            </select>
          </label>
          <textarea
            rows={4}
            value={memoContent}
            onChange={(e) => setMemoContent(e.target.value)}
            placeholder="先生からの指摘や自分用メモを入力"
          />
          <button type="button" onClick={createMemo} disabled={busy || !memoContent.trim()}>
            メモを追加
          </button>

          <hr />
          {memos.map((memo) => (
            <p key={memo.id}>
              <span className="badge">
                {memo.memo_type === 'SELF_NOTE' ? '自己メモ' : '先生フィードバック'}
              </span>{' '}
              {memo.content}
            </p>
          ))}
        </div>

        <div className="card">
          <button
            type="button"
            onClick={deleteEntry}
            disabled={busy}
            className="btn-danger"
          >
            エントリー削除
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}
      </section>
    </div>
  );
}
