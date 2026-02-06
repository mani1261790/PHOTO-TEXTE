'use client';

import { useMemo, useState } from 'react';

import { HighlightToken } from '@/lib/cefr/vocab';

export function UnknownWords({
  label,
  tokens
}: {
  label: string;
  tokens: HighlightToken[];
}) {
  const [selected, setSelected] = useState<HighlightToken | null>(null);

  const unknownCount = useMemo(
    () => tokens.filter((token) => token.unknown).length,
    [tokens]
  );

  return (
    <div className="card">
      <h4>
        {label} <span className="badge">未知語: {unknownCount}</span>
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
