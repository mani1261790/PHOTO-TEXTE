'use client';

import { KeyboardEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';

import { DiffToken } from '@/lib/diff/read-only';
import { useLanguage } from '@/components/LanguageProvider';

type Props = {
  tokens: DiffToken[];
  knownWords?: string[];
  unknownWords?: string[];
  grammarWords?: string[];
  showLegend?: boolean;
  interactiveWordHighlight?: boolean;
  showDiffColors?: boolean;
};

type HighlightClassName = 'diff-hl-grammar' | 'diff-hl-known' | 'diff-hl-unknown';

const HIGHLIGHT_CLASSES: HighlightClassName[] = [
  'diff-hl-grammar',
  'diff-hl-known',
  'diff-hl-unknown',
];

function normalizeWord(token: string): string {
  return token
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^[^a-zàâçéèêëîïôûùüÿñæœ']+|[^a-zàâçéèêëîïôûùüÿñæœ']+$/gi, '');
}

function splitPreserveSpaces(value: string): string[] {
  return value.split(/(\s+)/g).filter((x) => x.length > 0);
}

export function DiffReadOnly({
  tokens,
  knownWords = [],
  unknownWords = [],
  grammarWords = [],
  showLegend = false,
  interactiveWordHighlight = false,
  showDiffColors = true,
}: Props) {
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === 'fr' ? fr : ja);
  const [wordClassByKey, setWordClassByKey] = useState<Record<string, string>>({});
  const dragStateRef = useRef<{
    pointerId: number;
    className: HighlightClassName;
    appliedKeys: Set<string>;
  } | null>(null);
  const tokenSignature = useMemo(
    () => tokens.map((token) => `${token.kind}:${token.value}`).join('\u241f'),
    [tokens]
  );

  const knownSet = new Set(knownWords.map(normalizeWord));
  const unknownSet = new Set(unknownWords.map(normalizeWord));
  const grammarSet = new Set(grammarWords.map(normalizeWord));

  useEffect(() => {
    setWordClassByKey({});
  }, [tokenSignature]);

  function cycleWordClass(current: string): HighlightClassName {
    const currentIndex = HIGHLIGHT_CLASSES.indexOf(current as HighlightClassName);
    if (currentIndex === -1) return HIGHLIGHT_CLASSES[0];
    return HIGHLIGHT_CLASSES[(currentIndex + 1) % HIGHLIGHT_CLASSES.length];
  }

  function setWordClass(overrideKey: string, nextClassName: HighlightClassName) {
    setWordClassByKey((prev) => {
      return {
        ...prev,
        [overrideKey]: nextClassName,
      };
    });
  }

  function getNextClassName(currentClassName: string) {
    return cycleWordClass(currentClassName);
  }

  function handleWordPointerDown(
    event: PointerEvent<HTMLButtonElement>,
    overrideKey: string,
    currentClassName: string
  ) {
    event.preventDefault();
    const nextClassName = getNextClassName(currentClassName);
    dragStateRef.current = {
      pointerId: event.pointerId,
      className: nextClassName,
      appliedKeys: new Set([overrideKey]),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setWordClass(overrideKey, nextClassName);
  }

  function handleWordPointerEnter(
    event: PointerEvent<HTMLButtonElement>,
    overrideKey: string
  ) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    if (dragState.appliedKeys.has(overrideKey)) return;
    dragState.appliedKeys.add(overrideKey);
    setWordClass(overrideKey, dragState.className);
  }

  function clearDragState(pointerId: number) {
    if (dragStateRef.current?.pointerId !== pointerId) return;
    dragStateRef.current = null;
  }

  function handleWordKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    overrideKey: string,
    currentClassName: string
  ) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setWordClass(overrideKey, getNextClassName(currentClassName));
  }

  return (
    <div className="card">
      <h3>{t('差分表示（読み取り専用）', 'Diff (lecture seule)')}</h3>
      <p className="badge">
        {interactiveWordHighlight
          ? t(
              '単語をタップで色切替。押したままなぞると複数語をまとめて変更。',
              'Touchez un mot pour changer sa couleur. Glissez pour appliquer la meme couleur a plusieurs mots.'
            )
          : t('操作不可', 'Non modifiable')}
      </p>
      <pre className="diff-block">
        {tokens.map((token, idx) => {
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

          return splitPreserveSpaces(token.value).map((part, partIdx) => {
            const key = normalizeWord(part);
            let className = '';
            if (key && grammarSet.has(key)) className = 'diff-hl-grammar';
            else if (key && knownSet.has(key)) className = 'diff-hl-known';
            else if (key && unknownSet.has(key)) className = 'diff-hl-unknown';

            const overrideKey = `${idx}-${partIdx}`;
            const activeClassName = wordClassByKey[overrideKey] ?? className;
            const canTap = interactiveWordHighlight && Boolean(key);

            if (canTap) {
              return (
                <button
                  key={`${idx}-${partIdx}`}
                  type="button"
                  className={`diff-word-btn${activeClassName ? ` ${activeClassName}` : ''}`}
                  onPointerDown={(event) => handleWordPointerDown(event, overrideKey, activeClassName)}
                  onPointerEnter={(event) => handleWordPointerEnter(event, overrideKey)}
                  onPointerUp={(event) => clearDragState(event.pointerId)}
                  onPointerCancel={(event) => clearDragState(event.pointerId)}
                  onLostPointerCapture={(event) => clearDragState(event.pointerId)}
                  onKeyDown={(event) => handleWordKeyDown(event, overrideKey, activeClassName)}
                >
                  {part}
                </button>
              );
            }

            return (
              <span key={`${idx}-${partIdx}`} className={activeClassName}>
                {part}
              </span>
            );
          });
        })}
      </pre>

      {showLegend ? (
        <div className="diff-legend">
          <p><span className="diff-hl-grammar">{t('文法は黄色でハイライト', 'Je souligne la grammaire en jaune')}</span></p>
          <p><span className="diff-hl-known">{t('知っている語はピンクでハイライト', 'Je souligne les mots que je connais en rose')}</span></p>
          <p><span className="diff-hl-unknown">{t('覚えたい語は青でハイライト', 'Je souligne les mots utiles, que je ne connais pas, en bleu')}</span></p>
        </div>
      ) : null}
    </div>
  );
}
