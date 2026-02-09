'use client';

import { useMemo, useState } from 'react';

import { HighlightToken } from '@/lib/cefr/vocab';
import { useLanguage } from '@/components/LanguageProvider';

export function UnknownWords({
  label,
  tokens
}: {
  label: string;
  tokens: HighlightToken[];
}) {
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === 'fr' ? fr : ja);
  const [selected, setSelected] = useState<HighlightToken | null>(null);

  const unknownCount = useMemo(
    () => tokens.filter((token) => token.unknown).length,
    [tokens]
  );

  return (
    <div className="card">
      <h4>
        {label} <span className="badge">{t('未知語', 'Mots inconnus')}: {unknownCount}</span>
      </h4>
      <p>
        {tokens.map((token, idx) => {
          if (!token.unknown) {
            return <span key={idx}>{token.token}</span>;
          }
          return (
            <button
              type="button"
              key={idx}
              className="unknown-btn"
              onClick={() => setSelected(token)}
            >
              {token.token}
            </button>
          );
        })}
      </p>
      {selected ? (
        <p className="badge">
          {selected.lemma}: {selected.meaning}
        </p>
      ) : null}
    </div>
  );
}
