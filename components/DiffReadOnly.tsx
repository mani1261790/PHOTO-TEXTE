'use client';

import { DiffToken } from '@/lib/diff/read-only';
import { useLanguage } from '@/components/LanguageProvider';

export function DiffReadOnly({ tokens }: { tokens: DiffToken[] }) {
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === 'fr' ? fr : ja);

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
          return <span key={idx}>{token.value}</span>;
        })}
      </pre>
    </div>
  );
}
