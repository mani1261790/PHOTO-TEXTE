'use client';

import { DiffToken } from '@/lib/diff/read-only';
import { useLanguage } from '@/components/LanguageProvider';

type Props = {
  tokens: DiffToken[];
  knownWords?: string[];
  unknownWords?: string[];
  grammarWords?: string[];
  showLegend?: boolean;
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
}: Props) {
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === 'fr' ? fr : ja);

  const knownSet = new Set(knownWords.map(normalizeWord));
  const unknownSet = new Set(unknownWords.map(normalizeWord));
  const grammarSet = new Set(grammarWords.map(normalizeWord));

  return (
    <div className="card">
      <h3>{t('差分表示（読み取り専用）', 'Diff (lecture seule)')}</h3>
      <p className="badge">{t('操作不可', 'Non modifiable')}</p>
      <pre className="diff-block">
        {tokens.map((token, idx) => {
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

          return splitPreserveSpaces(token.value).map((part, partIdx) => {
            const key = normalizeWord(part);
            let className = '';
            if (key && grammarSet.has(key)) className = 'diff-hl-grammar';
            else if (key && knownSet.has(key)) className = 'diff-hl-known';
            else if (key && unknownSet.has(key)) className = 'diff-hl-unknown';
            return (
              <span key={`${idx}-${partIdx}`} className={className}>
                {part}
              </span>
            );
          });
        })}
      </pre>

      {showLegend ? (
        <div className="diff-legend">
          <p><span className="diff-hl-grammar">Je souligne la grammaire en jaune</span></p>
          <p><span className="diff-hl-known">Je souligne les mots que je connais en rose</span></p>
          <p><span className="diff-hl-unknown">Je souligne les mots utiles, que je ne connais pas, en bleu</span></p>
        </div>
      ) : null}
    </div>
  );
}
