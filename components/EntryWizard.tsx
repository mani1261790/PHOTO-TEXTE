'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api/fetcher';
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
  { key: 'DRAFT_FR', title: '下書き作成', detail: 'タイトルと本文を整える' },
  { key: 'JP_AUTO_READY', title: 'JP自動翻訳', detail: 'FRからJPを生成' },
  { key: 'JP_INTENT_LOCKED', title: '意図JPロック', detail: 'ここが最後の編集ポイント' },
  { key: 'FINAL_FR_READY', title: '最終FR生成', detail: 'AI出力は読み取り専用' },
  { key: 'EXPORTED', title: 'PPTX出力', detail: '提出物をダウンロード' }
] as const;

const statusIndex: Record<Entry['status'], number> = {
  DRAFT_FR: 0,
  JP_AUTO_READY: 1,
  JP_INTENT_LOCKED: 2,
  FINAL_FR_READY: 3,
  EXPORTED: 4
};

const statusLabel: Record<Entry['status'], string> = {
  DRAFT_FR: '下書き作成中',
  JP_AUTO_READY: 'JP自動翻訳完了',
  JP_INTENT_LOCKED: '意図JPロック済み',
  FINAL_FR_READY: '最終FR生成完了',
  EXPORTED: 'エクスポート済み'
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
  const [includeMemos, setIncludeMemos] = useState(true);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const draftEditable = useMemo(
    () => entry?.status === 'DRAFT_FR' || entry?.status === 'JP_AUTO_READY',
    [entry]
  );

  const progress = useMemo(() => {
    if (!entry) return 0;
    return Math.round(((statusIndex[entry.status] + 1) / steps.length) * 100);
  }, [entry]);

  async function loadEntry() {
    const [entryData, memoData] = await Promise.all([
      apiFetch<Entry>(`/api/entries/${id}`),
      apiFetch<{ memos: Memo[] }>(`/api/entries/${id}/memos`)
    ]);
    setEntry(entryData);
    setMemos(memoData.memos);
    setJpIntentDraft(entryData.jp_auto ?? '');

    if (entryData.final_fr) {
      const diff = await apiFetch<{
        diff: { tokens: DiffToken[] };
        draft_highlights: HighlightToken[];
        final_highlights: HighlightToken[];
      }>(`/api/entries/${id}/diff`);
      setDiffTokens(diff.diff.tokens);
      setDraftHighlights(diff.draft_highlights);
      setFinalHighlights(diff.final_highlights);
    }
  }

  useEffect(() => {
    loadEntry().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function updateDraftFields() {
    if (!entry || !draftEditable) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Entry>(`/api/entries/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title_fr: entry.title_fr, draft_fr: entry.draft_fr })
      });
      setEntry(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function translate() {
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
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rewrite() {
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Entry>(`/api/entries/${id}/rewrite`, {
        method: 'POST',
        body: '{}'
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
        body: JSON.stringify({ include_memos: includeMemos })
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
      router.push('/entries');
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
          <Link href="/entries">一覧に戻る</Link>
        </p>
      </aside>

      <section>
        <div className="card hero">
          <div className="hero-title-row">
            <h1>{entry.title_fr || 'PHOTO-TEXTE'}</h1>
            <span className="badge">{statusLabel[entry.status]}</span>
          </div>
          <p>課題の現在地を確認しながら、次の1手だけを進めてください。</p>
          <div className="metric-grid">
            <div className="metric">
              <span>進捗</span>
              <strong>{progress}%</strong>
            </div>
            <div className="metric">
              <span>未知語</span>
              <strong>{draftHighlights.filter((x) => x.unknown).length + finalHighlights.filter((x) => x.unknown).length}</strong>
            </div>
            <div className="metric">
              <span>メモ</span>
              <strong>{memos.length}</strong>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>ステップ2: 入力（下書き）</h3>
          <label>
            タイトル（FR）
            <input
              value={entry.title_fr}
              onChange={(e) => setEntry({ ...entry, title_fr: e.target.value })}
              disabled={!draftEditable || busy}
            />
          </label>
          <label>
            下書き本文（FR）
            <textarea
              rows={6}
              value={entry.draft_fr}
              onChange={(e) => setEntry({ ...entry, draft_fr: e.target.value })}
              disabled={!draftEditable || busy}
            />
          </label>
          <button type="button" onClick={updateDraftFields} disabled={!draftEditable || busy}>
            下書きを保存
          </button>
          {entry.status !== 'DRAFT_FR' && entry.status !== 'JP_AUTO_READY' ? (
            <p className="badge">ロック後は編集できません</p>
          ) : null}
        </div>

        <div className="card">
          <h3>ステップ3: JP自動翻訳</h3>
          <button type="button" onClick={translate} disabled={!draftEditable || busy}>
            FRからJPへ翻訳
          </button>
          <textarea rows={6} value={entry.jp_auto ?? ''} readOnly />
        </div>

        <div className="card">
          <h3>ステップ4: 意図JPを編集（最終編集）</h3>
          {entry.status === 'JP_AUTO_READY' ? (
            <>
              <textarea
                rows={6}
                value={jpIntentDraft}
                onChange={(e) => setJpIntentDraft(e.target.value)}
              />
              <button type="button" onClick={lockIntent} disabled={busy || !jpIntentDraft.trim()}>
                意図JPをロック（一方向）
              </button>
            </>
          ) : (
            <textarea rows={6} value={entry.jp_intent ?? jpIntentDraft} readOnly />
          )}
        </div>

        <div className="card">
          <h3>ステップ5: 最終フランス語生成（編集不可）</h3>
          <button
            type="button"
            onClick={rewrite}
            disabled={busy || entry.status !== 'JP_INTENT_LOCKED'}
          >
            意図JPから最終FRを生成
          </button>
          <textarea rows={7} value={entry.final_fr ?? ''} readOnly />
        </div>

        {entry.final_fr ? (
          <>
            <DiffReadOnly tokens={diffTokens} />
            <UnknownWords label="下書き（FR）" tokens={draftHighlights} />
            <UnknownWords label="最終文（FR）" tokens={finalHighlights} />
          </>
        ) : null}

        <div className="card">
          <h3>ステップ7: PPTXエクスポート</h3>
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={includeMemos}
              onChange={(e) => setIncludeMemos(e.target.checked)}
            />
            <span>スライド4にメモ要約を含める</span>
          </label>
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
          <h3>ステップ8: メモ</h3>
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
