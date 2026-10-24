'use client';

import { ReactNode } from 'react';

import { useLanguage } from '@/components/LanguageProvider';
import { DiffToken } from '@/lib/diff/read-only';

type Props = {
  tokens: DiffToken[];
  afterTone?: 'green' | 'blue';
  beforeLabel?: string;
  afterLabel?: string;
  afterEditor?: ReactNode;
};

export function EntryDiffComparison({
  tokens,
  afterTone = 'green',
  beforeLabel,
  afterLabel,
  afterEditor
}: Props) {
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === 'fr' ? fr : ja);

  const renderSide = (side: 'before' | 'after') =>
    tokens.map((token, index) => {
      if (side === 'before' && token.kind === 'add') return null;
      if (side === 'after' && token.kind === 'remove') return null;

      const className =
        token.kind === 'remove'
          ? 'diff-side-remove'
          : token.kind === 'add'
            ? afterTone === 'blue'
              ? 'diff-side-add-blue'
              : 'diff-side-add'
            : undefined;

      return (
        <span key={`${side}-${index}`} className={className}>
          {token.value}
        </span>
      );
    });

  return (
    <div className="entry-diff-comparison">
      <section className="entry-diff-panel entry-diff-before">
        <h5>{beforeLabel ?? t('元のテキスト', 'Texte original')}</h5>
        <p className="entry-diff-text">{renderSide('before')}</p>
      </section>
      <section className={`entry-diff-panel entry-diff-after${afterTone === 'blue' ? ' entry-diff-after-blue' : ''}`}>
        <h5>{afterLabel ?? t('修正後のテキスト', 'Texte corrigé')}</h5>
        <p className="entry-diff-text">{renderSide('after')}</p>
        {afterEditor}
      </section>
    </div>
  );
}
