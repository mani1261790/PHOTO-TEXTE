'use client';

import { useEffect, useState } from 'react';

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

  const knownSet = new Set(knownWords.map(normalizeWord));
  const unknownSet = new Set(unknownWords.map(normalizeWord));
  const grammarSet = new Set(grammarWords.map(normalizeWord));

  useEffect(() => {
    setWordClassByKey({});
  }, [tokens]);

  function cycleWordClass(current: string): string {
    if (!current) return 'diff-hl-grammar';
    if (current === 'diff-hl-grammar') return 'diff-hl-known';
    if (current === 'diff-hl-known') return 'diff-hl-unknown';
    return '';
  }

  return (
    <div className="card">
      <h3>{t('差分表示（読み取り専用）', 'Diff (lecture seule)')}</h3>
      <p className="badge">
        {interactiveWordHighlight
          ? t('単語をタップして色を変更', 'Touchez un mot pour changer sa couleur')
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
                  onClick={() => {
                    setWordClassByKey((prev) => ({
                      ...prev,
                      [overrideKey]: cycleWordClass(activeClassName),
                    }));
                  }}
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
