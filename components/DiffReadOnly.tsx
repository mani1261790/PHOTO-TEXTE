'use client';

import { KeyboardEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';

import { DiffToken } from '@/lib/diff/read-only';
import {
  LearningHighlights,
  SavedHighlightKind,
  getLearningTokenSignature,
  normalizeLearningWord,
  splitLearningText,
} from '@/lib/learning/highlight';
import { useLanguage } from '@/components/LanguageProvider';

type Props = {
  tokens: DiffToken[];
  knownWords?: string[];
  unknownWords?: string[];
  grammarWords?: string[];
  savedTokenSignature?: string | null;
  savedWordClassByKey?: Record<string, SavedHighlightKind>;
  onLearningHighlightsChange?: (next: LearningHighlights) => void;
  showLegend?: boolean;
  interactiveWordHighlight?: boolean;
  showDiffColors?: boolean;
};

type HighlightClassName = '' | 'diff-hl-grammar' | 'diff-hl-known' | 'diff-hl-unknown';

const HIGHLIGHT_ORDER: SavedHighlightKind[] = [
  'none',
  'grammar',
  'known',
  'unknown',
];

function kindToClassName(kind: SavedHighlightKind): HighlightClassName {
  if (kind === 'grammar') return 'diff-hl-grammar';
  if (kind === 'known') return 'diff-hl-known';
  if (kind === 'unknown') return 'diff-hl-unknown';
  return '';
}

function isWhitespace(value: string): boolean {
  return /^\s+$/.test(value);
}

export function DiffReadOnly({
  tokens,
  knownWords = [],
  unknownWords = [],
  grammarWords = [],
  savedTokenSignature,
  savedWordClassByKey,
  onLearningHighlightsChange,
  showLegend = false,
  interactiveWordHighlight = false,
  showDiffColors = true,
}: Props) {
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === 'fr' ? fr : ja);
  const isInteractiveHighlightMode = interactiveWordHighlight && !showDiffColors;
  const [wordClassByKey, setWordClassByKey] = useState<Record<string, SavedHighlightKind>>({});
  const dragStateRef = useRef<{
    pointerId: number;
    className: SavedHighlightKind;
    appliedKeys: Set<string>;
  } | null>(null);
  const tokenSignature = useMemo(() => getLearningTokenSignature(tokens), [tokens]);

  const grammarSet = useMemo(
    () => new Set(grammarWords.map(normalizeLearningWord).filter(Boolean)),
    [grammarWords]
  );
  const knownSet = useMemo(
    () => new Set(knownWords.map(normalizeLearningWord).filter(Boolean)),
    [knownWords]
  );
  const unknownSet = useMemo(
    () => new Set(unknownWords.map(normalizeLearningWord).filter(Boolean)),
    [unknownWords]
  );

  useEffect(() => {
    if (savedTokenSignature === tokenSignature) {
      setWordClassByKey(savedWordClassByKey ?? {});
      return;
    }
    setWordClassByKey({});
  }, [savedTokenSignature, savedWordClassByKey, tokenSignature]);

  function cycleWordClass(current: SavedHighlightKind): SavedHighlightKind {
    const currentIndex = HIGHLIGHT_ORDER.indexOf(current);
    return HIGHLIGHT_ORDER[(currentIndex + 1) % HIGHLIGHT_ORDER.length];
  }

  function getDefaultKind(part: string, fallbackKind: SavedHighlightKind): SavedHighlightKind {
    const key = normalizeLearningWord(part);
    if (!key) return 'none';
    if (unknownSet.has(key)) return 'unknown';
    if (grammarSet.has(key)) return 'grammar';
    if (knownSet.has(key)) return 'known';
    return fallbackKind;
  }

  function emitLearningHighlights(nextWordClassByKey: Record<string, SavedHighlightKind>) {
    if (!onLearningHighlightsChange) return;

    const nextKnownWords = new Set<string>();
    const nextUnknownWords = new Set<string>();
    const nextGrammarWords = new Set<string>();

    tokens.forEach((token, tokenIndex) => {
      if (token.kind === 'remove') return;

      const fallbackKind: SavedHighlightKind = token.kind === 'add' ? 'grammar' : 'none';
      splitLearningText(token.value).forEach((part, partIndex) => {
        const word = normalizeLearningWord(part);
        if (!word) return;

        const overrideKey = `${tokenIndex}-${partIndex}`;
        const highlightKind =
          nextWordClassByKey[overrideKey] ?? getDefaultKind(part, fallbackKind);

        if (highlightKind === 'grammar') nextGrammarWords.add(word);
        else if (highlightKind === 'known') nextKnownWords.add(word);
        else if (highlightKind === 'unknown') nextUnknownWords.add(word);
      });
    });

    nextUnknownWords.forEach((word) => {
      nextKnownWords.delete(word);
      nextGrammarWords.delete(word);
    });
    nextGrammarWords.forEach((word) => {
      nextKnownWords.delete(word);
    });

    onLearningHighlightsChange({
      knownWords: [...nextKnownWords],
      unknownWords: [...nextUnknownWords],
      grammarWords: [...nextGrammarWords],
      tokenSignature,
      wordClassByKey: nextWordClassByKey,
    });
  }

  function setWordClass(overrideKey: string, nextKind: SavedHighlightKind) {
    setWordClassByKey((prev) => {
      const next = { ...prev, [overrideKey]: nextKind };
      emitLearningHighlights(next);
      return next;
    });
  }

  function handleWordPointerDown(
    event: PointerEvent<HTMLButtonElement>,
    overrideKey: string,
    currentKind: SavedHighlightKind
  ) {
    event.preventDefault();
    const nextClassName = cycleWordClass(currentKind);
    dragStateRef.current = {
      pointerId: event.pointerId,
      className: nextClassName,
      appliedKeys: new Set([overrideKey]),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setWordClass(overrideKey, nextClassName);
  }

  function clearDragState(pointerId: number) {
    if (dragStateRef.current?.pointerId !== pointerId) return;
    dragStateRef.current = null;
  }

  function applyDraggedWord(target: EventTarget | null) {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    const wordButton = target instanceof Element
      ? target.closest<HTMLButtonElement>('[data-diff-word-key]')
      : null;
    const overrideKey = wordButton?.dataset.diffWordKey;
    if (!overrideKey || dragState.appliedKeys.has(overrideKey)) return;

    dragState.appliedKeys.add(overrideKey);
    setWordClass(overrideKey, dragState.className);
  }

  function handleWordPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    applyDraggedWord(document.elementFromPoint(event.clientX, event.clientY));
  }

  function handleDiffBlockPointerMove(event: PointerEvent<HTMLPreElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    applyDraggedWord(event.target);
  }

  function handleWordKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    overrideKey: string,
    currentKind: SavedHighlightKind
  ) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setWordClass(overrideKey, cycleWordClass(currentKind));
  }

  function renderInteractivePart(
    part: string,
    overrideKey: string,
    defaultKind: SavedHighlightKind
  ) {
    const key = normalizeLearningWord(part);
    const activeKind = key ? wordClassByKey[overrideKey] ?? defaultKind : 'none';
    const activeClassName = kindToClassName(activeKind);
    const canTap = interactiveWordHighlight && Boolean(key);

    if (!canTap) {
      return (
        <span key={overrideKey} className={activeClassName}>
          {part}
        </span>
      );
    }

    return (
      <button
        key={overrideKey}
        type="button"
        data-diff-word-key={overrideKey}
        className={`diff-word-btn${activeClassName ? ` ${activeClassName}` : ''}`}
        onPointerDown={(event) => handleWordPointerDown(event, overrideKey, activeKind)}
        onPointerMove={handleWordPointerMove}
        onPointerUp={(event) => clearDragState(event.pointerId)}
        onPointerCancel={(event) => clearDragState(event.pointerId)}
        onLostPointerCapture={(event) => clearDragState(event.pointerId)}
        onKeyDown={(event) => handleWordKeyDown(event, overrideKey, activeKind)}
      >
        {part}
      </button>
    );
  }

  return (
    <div className="card diff-readonly-card">
      <h3>
        {isInteractiveHighlightMode
          ? t('訂正ハイライト（読み取り専用）', 'Surlignage des corrections (lecture seule)')
          : t('差分表示（読み取り専用）', 'Diff (lecture seule)')}
      </h3>
      <p className="badge diff-instruction-badge">
        {isInteractiveHighlightMode
          ? t(
              '最終文だけを表示しています。訂正語は最初だけ黄色。単語をタップで無色→黄→ピンク→青→無色、押したままなぞると複数語をまとめて変更。',
              'Seul le texte final est affiche. Les mots corriges commencent en jaune. Touchez pour faire tourner sans couleur -> jaune -> rose -> bleu -> sans couleur. Glissez pour appliquer a plusieurs mots.'
            )
          : t('操作不可', 'Non modifiable')}
      </p>
      <pre
        className="diff-block"
        onPointerMove={isInteractiveHighlightMode ? handleDiffBlockPointerMove : undefined}
      >
        {tokens.map((token, idx) => {
          if (isInteractiveHighlightMode) {
            if (token.kind === 'remove') return null;

            const fallbackKind: SavedHighlightKind =
              token.kind === 'add' ? 'grammar' : 'none';

            return splitLearningText(token.value).map((part, partIdx) =>
              renderInteractivePart(
                part,
                `${idx}-${partIdx}`,
                isWhitespace(part) ? 'none' : getDefaultKind(part, fallbackKind)
              )
            );
          }

          if (token.kind === 'add') {
            return (
              <span key={idx} className={showDiffColors ? 'diff-add' : 'diff-add diff-add-muted'}>
                +{token.value}
              </span>
            );
          }
          if (token.kind === 'remove') {
            return (
              <span key={idx} className={showDiffColors ? 'diff-remove' : 'diff-remove diff-remove-muted'}>
                -{token.value}
              </span>
            );
          }

          return splitLearningText(token.value).map((part, partIdx) => {
            return renderInteractivePart(part, `${idx}-${partIdx}`, getDefaultKind(part, 'none'));
          });
        })}
      </pre>

      {showLegend ? (
        <div className="diff-legend">
          {isInteractiveHighlightMode ? (
            <>
              <p><span className="diff-hl-grammar">{t('文法は黄色でハイライト', 'Je souligne la grammaire en jaune')}</span></p>
              <p><span className="diff-hl-known">{t('知っている語の誤りはピンクでハイライト', 'Je souligne en rose les erreurs sur des mots deja connus')}</span></p>
              <p><span className="diff-hl-unknown">{t('覚えたい語は青でハイライト', 'Je souligne les mots utiles, que je ne connais pas, en bleu')}</span></p>
            </>
          ) : (
            <>
              <p><span className="diff-hl-grammar">{t('文法は黄色でハイライト', 'Je souligne la grammaire en jaune')}</span></p>
              <p><span className="diff-hl-known">{t('知っている語の誤りはピンクでハイライト', 'Je souligne en rose les erreurs sur des mots deja connus')}</span></p>
              <p><span className="diff-hl-unknown">{t('覚えたい語は青でハイライト', 'Je souligne les mots utiles, que je ne connais pas, en bleu')}</span></p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
